<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\GuardMessage;
use App\Models\Service;
use App\Models\WaitlistEntry;
use App\Services\Guard\GuardEngine;
use App\Services\PhoneVerification;
use Illuminate\Http\Request;

/**
 * The appointment guard, for the operator console.
 *
 * `tick` is what the scheduler runs every few minutes, exposed so the console
 * can run it on arrival instead of waiting for the next one. `replies` takes a
 * customer's message as the channel's webhook will deliver it — today the
 * console's simulator posts here, which is why it is behind the operator
 * gate rather than open.
 */
class GuardController extends Controller
{
    public function __construct(private GuardEngine $guard)
    {
    }

    public function messages(Request $request)
    {
        return response()->json(
            $this->guard->messages($this->orgId($request))->map(fn (GuardMessage $m) => $m->toDomain())->all()
        );
    }

    public function tick(Request $request)
    {
        $org = $this->orgId($request);
        $this->guard->tick($org);

        return response()->json([
            'messages' => $this->guard->messages($org)->map(fn (GuardMessage $m) => $m->toDomain())->all(),
            'bookings' => Booking::with('events')->where('org_id', $org)->orderBy('start_at')->get()
                ->map(fn (Booking $b) => BookingController::toDomain($b))->all(),
        ]);
    }

    public function reply(Request $request)
    {
        $data = $request->validate([
            'bookingId' => ['required', 'string'],
            'text' => ['required', 'string', 'max:1000'],
        ]);
        $org = $this->orgId($request);
        $booking = Booking::where('org_id', $org)->findOrFail($data['bookingId']);

        $result = $this->guard->reply($booking, $data['text']);

        return response()->json([
            'intent' => $result['intent'],
            'booking' => BookingController::toDomain($result['booking']),
            'messages' => $this->guard->messages($org)->map(fn (GuardMessage $m) => $m->toDomain())->all(),
        ]);
    }

    /** The team answering a customer from the inbox. */
    public function staffMessage(Request $request, string $bookingId)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:1000']]);
        $org = $this->orgId($request);
        $booking = Booking::with('customer')->where('org_id', $org)->findOrFail($bookingId);

        $this->guard->staffReply($booking, trim($data['body']), $request->user()->name);

        return response()->json([
            'messages' => $this->guard->messages($org)->map(fn (GuardMessage $m) => $m->toDomain())->all(),
        ], 201);
    }

    /** "Done": the conversation no longer needs anyone. */
    public function resolve(Request $request, string $bookingId)
    {
        $org = $this->orgId($request);
        $booking = Booking::where('org_id', $org)->findOrFail($bookingId);
        $this->guard->resolve($booking);

        return response()->json([
            'messages' => $this->guard->messages($org)->map(fn (GuardMessage $m) => $m->toDomain())->all(),
        ]);
    }

    /* ------------------------------------------------------------ waitlist */

    public function waitlist(Request $request)
    {
        return response()->json(
            WaitlistEntry::where('org_id', $this->orgId($request))->orderBy('created_at')->get()
                ->map(fn (WaitlistEntry $e) => $e->toDomain())->all()
        );
    }

    public function removeFromWaitlist(Request $request, string $id)
    {
        WaitlistEntry::where('org_id', $this->orgId($request))->findOrFail($id)->update(['status' => 'removed']);

        return response()->noContent();
    }

    /**
     * Joining from the booking page — public, like booking itself. The phone
     * is the identity, as everywhere else: an existing customer is matched,
     * a new one created.
     */
    public function join(Request $request, PhoneVerification $verification)
    {
        $data = $request->validate([
            'serviceId' => ['required', 'string'],
            'day' => ['nullable', 'date_format:Y-m-d'],
            'window' => ['nullable', 'array', 'size:2'],
            'window.*' => ['integer', 'between:0,1440'],
            'name' => ['required', 'string', 'min:2', 'max:255'],
            'phone' => ['required', 'string', 'max:64'],
            'verificationToken' => ['nullable', 'string', 'max:64'],
        ]);
        $org = $this->publicOrgId($request);
        $digits = Customer::normalisePhone($data['phone']);
        if (strlen($digits) < 9) {
            return response()->json(['error' => 'invalid_phone'], 422);
        }
        // An offer is a message to this phone, so only its holder may ask for one.
        if (! $verification->holds($org, $data['phone'], $data['verificationToken'] ?? null)) {
            return response()->json(['error' => 'phone_not_verified'], 422);
        }
        Service::where('org_id', $org)->where('is_active', true)->findOrFail($data['serviceId']);

        $customer = Customer::where('org_id', $org)->where('phone_digits', $digits)->first()
            ?? Customer::create(['org_id' => $org, 'name' => trim($data['name']), 'phone' => trim($data['phone'])]);

        // Asking twice for the same day is one place in the queue, not two.
        $already = WaitlistEntry::where('org_id', $org)->where('customer_id', $customer->id)
            ->where('service_id', $data['serviceId'])->where('day', $data['day'] ?? null)
            ->where('status', 'waiting')->exists();
        if ($already) {
            return response()->json(['joined' => true], 200);
        }

        WaitlistEntry::create([
            'org_id' => $org,
            'customer_id' => $customer->id,
            'service_id' => $data['serviceId'],
            'day' => $data['day'] ?? null,
            'window_from' => $data['window'][0] ?? null,
            'window_to' => $data['window'][1] ?? null,
            'status' => 'waiting',
        ]);

        return response()->json(['joined' => true], 201);
    }

    /** A candidate's answer to the offer of a freed slot — the simulator posts here. */
    public function replyToOffer(Request $request, string $id)
    {
        $data = $request->validate(['text' => ['required', 'string', 'max:1000']]);
        $org = $this->orgId($request);
        $offer = GuardMessage::where('org_id', $org)->where('template', 'backfill_offer')->findOrFail($id);

        $result = $this->guard->replyToOffer($offer, $data['text']);

        return response()->json([
            'intent' => $result['intent'],
            'booking' => $result['booking'] ? BookingController::toDomain($result['booking']) : null,
            'messages' => $this->guard->messages($org)->map(fn (GuardMessage $m) => $m->toDomain())->all(),
        ]);
    }
}
