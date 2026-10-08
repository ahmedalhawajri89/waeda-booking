<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\GuardController;
use App\Http\Controllers\Api\GuardPolicyController;
use App\Http\Controllers\Api\PublicBookingController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Middleware\EnsureOperator;
use App\Http\Middleware\ResolveOptionalUser;
use Illuminate\Support\Facades\Route;

/*
|---------------------------------------------------------------------------
| The whole API surface, on one screen.
|
| This file replaced 147 lines of Row Level Security. Postgres checked a
| policy on every row of every query, so a route that forgot to scope itself
| was still safe. Nothing here does that: what protects an endpoint is the
| middleware on its group and nothing else, which makes this file the security
| document of the backend. It is short on purpose — a surface you can read in
| one screen is a surface you can audit.
|
| The reads below are deliberately not all-or-nothing, because the policies
| they replace were not either. ResolveOptionalUser lets a request through
| unauthenticated and still resolves a user when a token is present, so a
| controller can answer "what may this caller see" the way a policy did — with
| a narrower result set rather than a refusal. A guest reading /bookings gets
| an empty list, exactly as `bookings_read` gave them no rows; they do not get
| a 403 that would break the booking wizard.
|---------------------------------------------------------------------------
*/

// ----------------------------------------------------------------- public
// Rate-limited harder than the rest: these are the only endpoints an
// unauthenticated caller can reach, so they are the only ones worth
// hammering. Booking is heavier than reading because it writes.
Route::prefix('public')->middleware('throttle:20,1')->group(function () {
    // Busy intervals for one resource: two timestamps each, nothing else. The
    // wizard needs them to grey out taken slots, and must not learn who is in
    // them — which is why this is its own endpoint rather than a relaxation
    // of the read above.
    Route::get('availability', [PublicBookingController::class, 'availability'])
        ->withoutMiddleware('throttle:20,1')->middleware('throttle:60,1');
    Route::post('bookings', [PublicBookingController::class, 'store']);
    // A class's seats taken, by session — counts only.
    Route::get('classes/{serviceId}/seats', [PublicBookingController::class, 'seats']);
    Route::get('bookings/{reference}', [PublicBookingController::class, 'show']);
    Route::post('bookings/{reference}/cancel', [PublicBookingController::class, 'cancel']);
    Route::post('bookings/{reference}/reschedule', [PublicBookingController::class, 'reschedule']);
    // "Tell me if a time frees up" — offered on the booking page when a day is full.
    Route::post('waitlist', [GuardController::class, 'join']);
});

// ------------------------------------------------------------------- auth
Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:5,1');
    // Opening a business: account, business, catalogue and hours in one go.
    Route::post('register-business', [AuthController::class, 'registerBusiness'])->middleware('throttle:5,1');
    Route::get('slug-available', [AuthController::class, 'slugAvailable'])->middleware('throttle:60,1');
    // A forgotten password: a link by email, then a new password from it.
    Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:10,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
    });
});

// -------------------------------------------------------------- app reads
// Scoped by who is asking, not gated on it — see the note above. The guest
// booking page has no session and still has to show services, resources and
// opening hours, so the catalog is readable by everyone; only active rows
// reach a caller who is not an operator, because a service the operator
// turned off should not be discoverable.
Route::middleware(ResolveOptionalUser::class)->group(function () {
    Route::get('catalog', [CatalogController::class, 'show']);
    Route::get('bookings', [BookingController::class, 'index']);
    Route::get('customers', [CustomerController::class, 'index']);
});

// ------------------------------------------------------------- app writes
// Every write the console makes. There is no non-operator path into any of
// these, and no delete route anywhere: cancelling is a state, and the audit
// trail has to survive it.
Route::middleware(['auth:sanctum', EnsureOperator::class])->group(function () {
    // One booking per request. A bulk PUT of the whole list used to live
    // here and created duplicates — see BookingController::store.
    Route::post('bookings', [BookingController::class, 'store']);
    Route::patch('bookings/{id}', [BookingController::class, 'update']);
    Route::post('bookings/{id}/acknowledge', [BookingController::class, 'acknowledge']);
    // The business's own plan and usage, and asking for more.
    Route::get('subscription', [SubscriptionController::class, 'show']);
    Route::post('subscription/requests', [SubscriptionController::class, 'request'])->middleware('throttle:10,1');
    Route::put('customers', [CustomerController::class, 'bulkUpdate']);
    Route::put('catalog', [CatalogController::class, 'update']);

    // The appointment guard's policy. Read here rather than in the public
    // reads above: it is how this business treats risky customers, which is
    // nobody else's business.
    Route::get('guard/policy', [GuardPolicyController::class, 'show']);
    Route::put('guard/policy', [GuardPolicyController::class, 'update']);
    Route::get('guard/messages', [GuardController::class, 'messages']);
    Route::post('guard/tick', [GuardController::class, 'tick']);
    Route::post('guard/replies', [GuardController::class, 'reply']);
    // The inbox: the team writing to a customer, and closing what is handled.
    Route::post('guard/conversations/{bookingId}/messages', [GuardController::class, 'staffMessage']);
    Route::post('guard/conversations/{bookingId}/resolve', [GuardController::class, 'resolve']);
    Route::get('guard/waitlist', [GuardController::class, 'waitlist']);
    Route::delete('guard/waitlist/{id}', [GuardController::class, 'removeFromWaitlist']);
    Route::post('guard/offers/{id}/replies', [GuardController::class, 'replyToOffer']);
});
