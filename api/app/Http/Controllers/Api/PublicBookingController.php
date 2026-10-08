<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Resource;
use App\Services\BookingRules;
use App\Services\BookingWriter;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The three things a visitor with no account can do.
 *
 * These were security-definer functions in Postgres for a reason that has not
 * changed: the guest paths need to write and read across tables that an
 * anonymous caller must not touch directly. Exposing the tables and letting a
 * policy sort it out would be the short version, and wrong — it would let a
 * caller choose their own price, end time and status.
 *
 * Everything that matters is computed here from the service row. The caller is
 * trusted for the service, the resource, the start time and who they are, and
 * for nothing else.
 */
class PublicBookingController extends Controller
{
    /**
     * A guest may change or cancel their own booking until this long before it
     * starts. Later than that the slot cannot be offered to anyone else in time,
     * so the change goes through the business. Mirrors src/lib/bookingPolicy.js.
     */
    public const CHANGE_CUTOFF_MIN = 120;

    public function __construct(private BookingWriter $writer, private BookingRules $rules)
    {
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'serviceId' => ['required', 'string'],
            'resourceId' => ['required', 'string'],
            'startAt' => ['required', 'date'],
            'name' => ['required', 'string', 'min:2', 'max:255'],
            'phone' => ['required', 'string', 'max:64'],
            'email' => ['nullable', 'email', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
            // One of the lengths the service offers (a 90-minute court); none is its default.
            'durationMin' => ['nullable', 'integer', 'between:5,600'],
        ]);

        $org = $this->publicOrgId($request);

        if (strlen(Customer::normalisePhone($data['phone'])) < 9) {
            return response()->json(['error' => 'invalid_phone'], 422);
        }

        // Throws InvalidBooking (422 with the same error codes as before).
        $service = $this->rules->service($org, $data['serviceId'], $data['resourceId']);
        $this->rules->resourceIsActive($org, $data['resourceId']);

        $start = Carbon::parse($data['startAt']);
        if ($start->isPast()) {
            return response()->json(['error' => 'start_in_past'], 422);
        }

        $duration = $this->rules->duration($service, $data['durationMin'] ?? null);
        // A class is booked at one of its own times, not any free moment.
        $this->rules->isSession($org, $service, $data['resourceId'], $start);
        $this->rules->withinHours($org, $start, $start->copy()->addMinutes($service->occupiedMinutes($duration)));

        // BookingWriter opens its own transaction and takes the resource lock;
        // the customer has to exist before that, so it is written first and
        // rolls back with the booking if the slot turns out to be taken.
        return DB::transaction(function () use ($org, $data, $service, $duration) {
            $customer = $this->upsertCustomer($org, $data);

            $booking = $this->writer->create([
                'org_id' => $org,
                'customer_id' => $customer->id,
                'service_id' => $service->id,
                'resource_id' => $data['resourceId'],
                'start_at' => $data['startAt'],
                'status' => 'pending',
                'payment_status' => 'unpaid',
                'channel' => 'online',
                'notes' => $data['notes'] ?? null,
                'duration_min' => $duration,
            ]);

            // The price the server settled on, so the page never shows its own guess.
            return response()->json([
                'id' => $booking->id,
                'reference' => $booking->reference,
                'priceMinor' => $booking->price_minor,
                'endAt' => $booking->end_at->toIso8601String(),
            ], 201);
        });
    }

    /**
     * When a resource is busy, and nothing else.
     *
     * The booking wizard needs to know which times are taken so it can grey
     * them out. It cannot read /bookings to find out — a guest gets an empty
     * list there, deliberately, because that endpoint carries who booked what.
     * Without this the wizard offered slots that were already gone and the
     * visitor only learned otherwise on submit.
     *
     * So this answers the narrowest possible version of the question: two
     * timestamps per busy interval on one resource, in one date range. No id,
     * no customer, no service, no status, no price — nothing that says who is
     * in the room, only that the room is occupied. Cancelled and no-show
     * bookings are absent because they release their time, matching BLOCKING
     * in src/lib/availability.js.
     */
    public function availability(Request $request)
    {
        $data = $request->validate([
            'resourceId' => ['required', 'string'],
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);

        // Only this organization's active resources: an arbitrary id used to
        // answer with the busy times of any room in the database.
        $resource = Resource::where('org_id', $this->publicOrgId($request))
            ->where('is_active', true)->find($data['resourceId']);
        if (! $resource) {
            return response()->json([]);
        }

        // Days are the business's days, not UTC's: in Riyadh a UTC day starts
        // at 3 a.m., which hid the first three hours of every evening's bookings.
        $tz = Organization::query()->whereKey($resource->org_id)->value('timezone') ?? 'UTC';
        $from = Carbon::parse($data['from'], $tz)->startOfDay();
        // Capped so a caller cannot ask for a decade and make this a scan.
        $to = Carbon::parse($data['to'], $tz)->endOfDay()->min($from->copy()->addDays(60));

        $busy = Booking::query()
            ->where('resource_id', $data['resourceId'])
            ->whereIn('status', Booking::BLOCKING)
            // Stored in UTC; the builder writes a Carbon's wall clock as-is.
            ->where('start_at', '<', $to->copy()->utc())
            ->where('end_at', '>', $from->copy()->utc())
            ->orderBy('start_at')
            ->get(['start_at', 'end_at']);

        return response()->json(
            $busy->map(fn (Booking $b) => [
                'startAt' => $b->start_at->toIso8601String(),
                'endAt' => $b->end_at->toIso8601String(),
            ])->all()
        );
    }

    /**
     * Seats taken in a class's sessions — counts only, never who. The busy
     * ranges above cannot tell one class's seats from another booking.
     */
    public function seats(Request $request, string $serviceId)
    {
        $data = $request->validate(['from' => ['required', 'date'], 'to' => ['required', 'date', 'after_or_equal:from']]);
        $org = $this->publicOrgId($request);
        $service = \App\Models\Service::where('org_id', $org)->where('is_active', true)->find($serviceId);
        if (! $service || ! $service->isGroup()) {
            return response()->json([]);
        }
        $tz = Organization::query()->whereKey($org)->value('timezone') ?? 'UTC';
        $from = Carbon::parse($data['from'], $tz)->startOfDay();
        $to = Carbon::parse($data['to'], $tz)->endOfDay()->min($from->copy()->addDays(60));

        return response()->json(
            Booking::query()->where('service_id', $service->id)->whereIn('status', Booking::BLOCKING)
                ->where('start_at', '>=', $from->copy()->utc())->where('start_at', '<=', $to->copy()->utc())
                ->get(['start_at', 'resource_id'])
                ->groupBy(fn ($b) => $b->resource_id.'|'.$b->start_at->toIso8601String())
                ->map(fn ($g) => [
                    'startAt' => $g->first()->start_at->toIso8601String(),
                    'resourceId' => $g->first()->resource_id,
                    'taken' => $g->count(),
                ])->values()->all()
        );
    }

    /** Same identity rule as the client: the phone is the key. */
    private function upsertCustomer(string $org, array $data): Customer
    {
        $digits = Customer::normalisePhone($data['phone']);
        $existing = Customer::where('org_id', $org)->where('phone_digits', $digits)->first();

        // `email` is optional, so it may be absent from the payload entirely
        // rather than present and null — and an absent one must never blank
        // out an address the customer gave us on a previous booking.
        $email = $data['email'] ?? null;

        if ($existing) {
            $existing->update([
                'name' => trim($data['name']),
                'email' => $email ?: $existing->email,
            ]);

            return $existing;
        }

        return Customer::create([
            'org_id' => $org,
            'name' => trim($data['name']),
            'phone' => trim($data['phone']),
            'email' => $email ?: null,
        ]);
    }

    /**
     * Look up a booking by its reference.
     *
     * Two factors, always. BK-2026-0431 is sequential and trivially guessable,
     * so a lookup keyed on the reference alone would expose every booking to
     * anyone who can count. Only the fields the customer-facing page renders
     * come back.
     */
    public function show(Request $request, string $reference)
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:64']]);
        $booking = $this->findByReferenceAndPhone($request, $reference, $data['phone']);

        if (! $booking) {
            return response()->json(['error' => 'not_found'], 404);
        }

        return response()->json([
            'reference' => $booking->reference,
            'startAt' => $booking->start_at->toIso8601String(),
            'endAt' => $booking->end_at->toIso8601String(),
            'status' => $booking->status,
            'paymentStatus' => $booking->payment_status,
            'priceMinor' => $booking->price_minor,
            // Whether someone at the business has seen it, so the page can say
            // so instead of leaving the guest to wonder.
            'acknowledgedAt' => $booking->acknowledged_at?->toIso8601String(),
            'serviceName' => $booking->service->name,
            'customerName' => $booking->customer->name,
            // What the manage page needs to offer other times for the same
            // service with the same person. Ids only; nothing about anyone else.
            'serviceId' => $booking->service_id,
            'resourceId' => $booking->resource_id,
            'resourceName' => $booking->resource?->name,
            'durationMin' => $booking->duration_min ?? $booking->service->duration_min,
        ]);
    }

    /** Cancel your own booking from that same page. */
    public function cancel(Request $request, string $reference)
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:64']]);
        $booking = $this->findByReferenceAndPhone($request, $reference, $data['phone']);

        if (! $booking || ! $this->changeable($booking)) {
            return response()->json(['error' => 'not_cancellable'], 404);
        }

        $this->writer->update($booking, ['status' => 'cancelled']);

        return response()->json(['cancelled' => true]);
    }

    /**
     * Move your own booking to another free time, same service, same person.
     *
     * The writer recomputes the end from the service, takes the resource lock
     * and refuses an overlap (409), so the guest supplies only the new start.
     * A guest moving their appointment is the alternative to a no-show, which
     * is why this exists at all.
     */
    public function reschedule(Request $request, string $reference)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:64'],
            'startAt' => ['required', 'date'],
        ]);
        $booking = $this->findByReferenceAndPhone($request, $reference, $data['phone']);

        if (! $booking || ! $this->changeable($booking)) {
            return response()->json(['error' => 'not_changeable'], 404);
        }

        $start = Carbon::parse($data['startAt'])->utc();
        if ($start->lessThanOrEqualTo(now()->addMinutes(self::CHANGE_CUTOFF_MIN))) {
            return response()->json(['error' => 'start_too_soon'], 422);
        }
        $this->rules->withinHours(
            $booking->org_id,
            $start,
            $start->copy()->addMinutes($booking->service->occupiedMinutes($booking->duration_min)),
        );

        $booking = $this->writer->update($booking, ['start_at' => $start]);
        // A new time the business has not seen yet: it needs seeing again.
        $booking->forceFill(['acknowledged_at' => null])->save();

        return response()->json([
            'reference' => $booking->reference,
            'startAt' => $booking->start_at->toIso8601String(),
            'endAt' => $booking->end_at->toIso8601String(),
            'status' => $booking->status,
            'acknowledgedAt' => null,
        ]);
    }

    /** Still open, and far enough ahead that the slot can go to someone else. */
    private function changeable(Booking $booking): bool
    {
        return in_array($booking->status, ['pending', 'confirmed'], true)
            && $booking->start_at->greaterThan(now()->addMinutes(self::CHANGE_CUTOFF_MIN));
    }

    private function findByReferenceAndPhone(Request $request, string $reference, string $phone): ?Booking
    {
        $last4 = substr(Customer::normalisePhone($phone), -4);
        if (strlen($last4) < 4) {
            return null;
        }

        // References count per business, so the business is part of the key.
        return Booking::with(['service', 'customer', 'resource'])
            ->where('org_id', $this->publicOrgId($request))
            ->whereRaw('upper(reference) = ?', [strtoupper(trim($reference))])
            ->whereHas('customer', fn ($q) => $q->whereRaw('right(phone_digits, 4) = ?', [$last4]))
            ->first();
    }
}
