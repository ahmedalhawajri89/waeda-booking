<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingEvent;
use App\Models\Customer;
use App\Services\BookingRules;
use App\Services\BookingWriter;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function __construct(private BookingWriter $writer, private BookingRules $rules)
    {
    }

    /** The domain shape src/types/index.js documents. */
    public static function toDomain(Booking $b): array
    {
        return [
            'id' => $b->id,
            'reference' => $b->reference,
            'customerId' => $b->customer_id,
            'serviceId' => $b->service_id,
            'resourceId' => $b->resource_id,
            'startAt' => $b->start_at->toIso8601String(),
            'endAt' => $b->end_at->toIso8601String(),
            'status' => $b->status,
            'paymentStatus' => $b->payment_status,
            'priceMinor' => $b->price_minor,
            'channel' => $b->channel,
            'notes' => $b->notes,
            'createdAt' => $b->created_at?->toIso8601String(),
            'updatedAt' => $b->updated_at?->toIso8601String(),
            'history' => $b->events->map(fn (BookingEvent $e) => [
                'at' => $e->at->toIso8601String(),
                'type' => $e->type,
                'summary' => $e->summary,
            ])->all(),
        ];
    }

    /**
     * What this caller may see, which is not the same as whether they may ask.
     *
     * This is `bookings_read` from the policies it replaces, in PHP: an
     * operator sees the organization's bookings, a signed-in customer sees
     * their own, and a guest sees none. A guest gets an empty list rather than
     * a 403 because that is what the policy did, and because the booking
     * wizard calls this before anyone has signed in — it needs slots, not an
     * error state.
     *
     * The wizard therefore shows a guest every slot as free, and the server is
     * the authority that refuses a taken one. That was true of the Postgres
     * build too; a public endpoint returning busy ranges without customer data
     * would be the better answer, and is not part of this port.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Booking::with('events')->orderBy('start_at');

        if ($user?->isOperator()) {
            $query->where('org_id', $this->orgId($request));
        } elseif ($user) {
            $query->whereIn('customer_id', Customer::where('user_id', $user->id)->select('id'));
        } else {
            return response()->json([]);
        }

        return response()->json($query->get()->map(fn (Booking $b) => self::toDomain($b))->all());
    }

    private const FIELDS = [
        'customerId' => 'customer_id',
        'serviceId' => 'service_id',
        'resourceId' => 'resource_id',
        'startAt' => 'start_at',
        'status' => 'status',
        'paymentStatus' => 'payment_status',
        'channel' => 'channel',
        'notes' => 'notes',
    ];

    /** Request keys → writer input, keeping a present-but-null `notes`. */
    private function toInput(array $data): array
    {
        $input = [];
        foreach (self::FIELDS as $from => $to) {
            if (array_key_exists($from, $data)) {
                $input[$to] = $data[$from];
            }
        }

        return $input;
    }

    /**
     * Create one booking.
     *
     * Replaces a bulk PUT of the operator's whole list. That endpoint created
     * any row whose id it did not recognise — and since the writer minted its
     * own id, the client's id was never recognised, so every later save
     * created the same booking again and then collided with it.
     *
     * Now the client sends a UUID it generated, and the row is stored under
     * it: a retried request finds its own booking and returns it rather than
     * booking twice.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'id' => ['nullable', 'uuid'],
            'customerId' => ['required', 'string'],
            'serviceId' => ['required', 'string'],
            'resourceId' => ['required', 'string'],
            'startAt' => ['required', 'date'],
            'status' => ['sometimes', 'in:pending,confirmed,completed,cancelled,no_show'],
            'paymentStatus' => ['sometimes', 'in:unpaid,deposit_paid,paid,refunded'],
            'channel' => ['sometimes', 'in:online,phone,walk_in'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $org = $this->orgId($request);

        if (! empty($data['id'])) {
            $existing = Booking::with('events')->find($data['id']);
            if ($existing) {
                // Ours: the retry of a request that already succeeded. Someone
                // else's: an id we must not reveal or overwrite.
                return $existing->org_id === $org
                    ? response()->json(self::toDomain($existing))
                    : response()->json(['error' => 'id_taken'], 409);
            }
        }

        Customer::where('org_id', $org)->findOrFail($data['customerId']);
        $service = $this->rules->service($org, $data['serviceId'], $data['resourceId']);
        $this->rules->resourceIsActive($org, $data['resourceId']);
        $start = Carbon::parse($data['startAt']);
        // No past-time rule here, unlike the public form: an operator records
        // walk-ins and phone bookings after the fact.
        $this->rules->withinHours($org, $start, $start->copy()->addMinutes($service->occupiedMinutes()));

        $booking = $this->writer->create(
            ['org_id' => $org, 'id' => $data['id'] ?? null] + $this->toInput($data),
            $request->user()->id,
        );

        return response()->json(self::toDomain($booking), 201);
    }

    /** Change one booking: any subset of its fields. */
    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'customerId' => ['sometimes', 'string'],
            'serviceId' => ['sometimes', 'string'],
            'resourceId' => ['sometimes', 'string'],
            'startAt' => ['sometimes', 'date'],
            'status' => ['sometimes', 'in:pending,confirmed,completed,cancelled,no_show'],
            'paymentStatus' => ['sometimes', 'in:unpaid,deposit_paid,paid,refunded'],
            'channel' => ['sometimes', 'in:online,phone,walk_in'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $org = $this->orgId($request);
        // Scoped by org: a booking id from another organization is a 404, not
        // a row this operator can edit.
        $booking = Booking::where('org_id', $org)->findOrFail($id);

        if (isset($data['customerId'])) {
            Customer::where('org_id', $org)->findOrFail($data['customerId']);
        }

        // Moving a booking, or changing what it is, has to land somewhere the
        // service can actually run, inside opening hours.
        $serviceId = $data['serviceId'] ?? $booking->service_id;
        $resourceId = $data['resourceId'] ?? $booking->resource_id;
        $start = isset($data['startAt']) ? Carbon::parse($data['startAt']) : $booking->start_at;
        $relocating = $serviceId !== $booking->service_id
            || $resourceId !== $booking->resource_id
            || ! $start->equalTo($booking->start_at);
        if ($relocating) {
            // A service switched off since booking can still be moved; only a
            // new choice of service has to be one that is on offer.
            $service = $this->rules->service($org, $serviceId, $resourceId, $serviceId !== $booking->service_id);
            $this->rules->withinHours($org, $start, $start->copy()->addMinutes($service->occupiedMinutes()));
        }

        $saved = $this->writer->update($booking, $this->toInput($data), $request->user()->id);

        return response()->json(self::toDomain($saved));
    }
}
