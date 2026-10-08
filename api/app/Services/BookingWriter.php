<?php

namespace App\Services;

use App\Exceptions\BookingConflict;
use App\Models\Booking;
use App\Models\BookingEvent;
use App\Models\Resource;
use App\Models\Service;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Every write that can create an overlap goes through here.
 *
 * ---------------------------------------------------------------------------
 * Why a class and not a constraint
 * ---------------------------------------------------------------------------
 * Postgres enforced "no double-booking" declaratively, with an exclusion
 * constraint over a range type. MySQL has neither, so the rule has to be
 * enforced by whoever writes — and a check-then-insert, on its own, is a race:
 * two operators confirming the same slot in the same second both read "free"
 * before either writes.
 *
 * What closes that race is the lock on the *resource* row, taken before the
 * overlap query runs. A resource is exactly the thing that can be
 * double-booked, so serialising writes per resource is the narrowest lock
 * that makes the check sound: concurrent bookings for different rooms still
 * proceed in parallel, and two for the same room queue up, with the second
 * one seeing the first one's write.
 *
 * The honest limit: this holds for anything that writes through the
 * application. A client with database credentials writing raw SQL can still
 * insert an overlap, which the Postgres constraint would have refused. That
 * is the real cost of the move, and it is stated here rather than glossed.
 * ---------------------------------------------------------------------------
 */
class BookingWriter
{
    public function __construct(private Pricing $pricing)
    {
    }

    /**
     * Half-open overlap: touching edges do not collide, matching overlaps() in
     * src/lib/availability.js exactly. An appointment ending at 10:00 and one
     * starting at 10:00 do not conflict; any real overlap does.
     *
     * A class is the one exception: seats in the same session (same service,
     * same start) share the time, up to the class's capacity. Anything else
     * on the resource at that time is still a clash.
     *
     * Must be called inside a transaction that already holds the resource lock.
     */
    private function overlaps(string $resourceId, CarbonInterface $start, CarbonInterface $end, ?string $ignoreId = null, ?Service $service = null): bool
    {
        $clashing = Booking::query()
            ->where('resource_id', $resourceId)
            ->whereIn('status', Booking::BLOCKING)
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))
            ->where('start_at', '<', $end)
            ->where('end_at', '>', $start)
            ->get(['service_id', 'start_at']);

        if (! $service || $service->capacity <= 1) {
            return $clashing->isNotEmpty();
        }
        $sameSession = $clashing->filter(fn ($b) => $b->service_id === $service->id && $b->start_at->equalTo($start));

        return $sameSession->count() !== $clashing->count() || $sameSession->count() >= $service->capacity;
    }

    /** Takes the per-resource mutex. Everything after this call is serialised. */
    private function lockResource(string $resourceId): void
    {
        Resource::query()->whereKey($resourceId)->lockForUpdate()->first();
    }

    /**
     * BK-2026-0431 — human-quotable over the phone, matching
     * bookingReference() in src/lib/id.js.
     *
     * MySQL has no sequences, so the counter is a row. Locking it inside the
     * booking transaction is what stops two concurrent bookings being handed
     * the same number; a `max(reference) + 1` would hand out duplicates under
     * exactly the load that makes them matter.
     */
    private function nextReference(): string
    {
        $year = (int) now()->format('Y');

        DB::table('booking_reference_counters')->insertOrIgnore([
            'year' => $year,
            'next_value' => 500,
        ]);

        $row = DB::table('booking_reference_counters')->where('year', $year)->lockForUpdate()->first();
        $value = $row->next_value;
        DB::table('booking_reference_counters')->where('year', $year)->update(['next_value' => $value + 1]);

        return sprintf('BK-%d-%04d', $year, $value);
    }

    private function event(Booking $booking, string $type, string $summary, ?int $actorId): void
    {
        BookingEvent::create([
            'booking_id' => $booking->id,
            'at' => now(),
            'type' => $type,
            'summary' => $summary,
            'actor_id' => $actorId,
        ]);
    }

    /**
     * Create a booking, computing everything the caller must not choose.
     *
     * Duration, buffer, end time, price and reference come from the service
     * row and the server clock. The caller is trusted for the service, the
     * resource, the start time and who they are, and for nothing else — the
     * same division the book_public function drew in Postgres.
     *
     * @throws BookingConflict
     */
    public function create(array $input, ?int $actorId = null): Booking
    {
        return DB::transaction(function () use ($input, $actorId) {
            /** @var Service $service */
            $service = Service::query()->where('org_id', $input['org_id'])->whereKey($input['service_id'])->firstOrFail();

            // UTC before it touches the database: the column has no zone, and an
            // offset left on the instant was stored as if it were UTC.
            $start = Carbon::parse($input['start_at'])->utc();
            // A chosen length, when the service offers more than one.
            $duration = isset($input['duration_min']) ? (int) $input['duration_min'] : null;
            $end = $start->copy()->addMinutes($service->occupiedMinutes($duration));

            $this->lockResource($input['resource_id']);
            if ($this->overlaps($input['resource_id'], $start, $end, null, $service)) {
                throw new BookingConflict();
            }

            $booking = Booking::create([
                // A client-chosen id makes creation idempotent: a retried
                // request finds its own row instead of booking twice.
                ...(isset($input['id']) ? ['id' => $input['id']] : []),
                'org_id' => $input['org_id'],
                'reference' => $this->nextReference(),
                'customer_id' => $input['customer_id'],
                'service_id' => $service->id,
                'resource_id' => $input['resource_id'],
                'start_at' => $start,
                'end_at' => $end,
                'status' => $input['status'] ?? 'pending',
                'payment_status' => $input['payment_status'] ?? 'unpaid',
                'price_minor' => $this->pricing->priceFor($service, $start, $duration),
                'channel' => $input['channel'] ?? 'online',
                'notes' => $input['notes'] ?? null,
                'duration_min' => $duration,
                'series_id' => $input['series_id'] ?? null,
            ]);

            $this->event($booking, 'created', 'أُنشئ الحجز', $actorId);
            if ($booking->status === 'confirmed') {
                $this->event($booking, 'confirmed', 'تم تأكيد الحجز', $actorId);
            }

            return $booking->load('events');
        });
    }

    /**
     * Apply the client's view of a booking to the stored row, and record what
     * actually changed.
     *
     * The history is derived here by comparing old and new, never taken from
     * the request. That is the whole reason it moved off the client: an audit
     * trail the caller supplies is a claim, not a record.
     *
     * @throws BookingConflict
     */
    /**
     * @param  array{type: string, summary: string}|null  $statusEvent  Recorded instead of the
     *         generic entry when the status changes — "released for silence" rather than "cancelled".
     */
    public function update(Booking $booking, array $input, ?int $actorId = null, ?array $statusEvent = null): Booking
    {
        return DB::transaction(function () use ($booking, $input, $actorId, $statusEvent) {
            $before = $booking->replicate();

            $start = isset($input['start_at']) ? Carbon::parse($input['start_at'])->utc() : $booking->start_at;
            $status = $input['status'] ?? $booking->status;
            $resourceId = $input['resource_id'] ?? $booking->resource_id;
            $serviceId = $input['service_id'] ?? $booking->service_id;

            /** @var Service $service */
            $service = Service::query()->where('org_id', $booking->org_id)->whereKey($serviceId)->firstOrFail();
            $serviceChanged = $serviceId !== $booking->service_id;

            // The end follows the start and the service, always. It used to be
            // recomputed only when the slot needed re-checking, so a cancelled
            // booking moved forward kept its old end and broke end > start.
            $duration = array_key_exists('duration_min', $input)
                ? ($input['duration_min'] === null ? null : (int) $input['duration_min'])
                : $booking->duration_min;
            $end = $start->copy()->addMinutes($service->occupiedMinutes($duration));

            $moved = ! $start->equalTo($booking->start_at)
                || ! $end->equalTo($booking->end_at)
                || $resourceId !== $booking->resource_id;
            $becomesBlocking = in_array($status, Booking::BLOCKING, true);

            // A cancelled booking releases its time, so it needs no check. One
            // that moves, grows, or comes back to life has to earn its slot again.
            if ($becomesBlocking && ($moved || ! in_array($booking->status, Booking::BLOCKING, true))) {
                $this->lockResource($resourceId);
                if ($this->overlaps($resourceId, $start, $end, $booking->id, $service)) {
                    throw new BookingConflict();
                }
            }

            $booking->fill([
                'status' => $status,
                'payment_status' => $input['payment_status'] ?? $booking->payment_status,
                'resource_id' => $resourceId,
                'service_id' => $serviceId,
                'customer_id' => $input['customer_id'] ?? $booking->customer_id,
                'channel' => $input['channel'] ?? $booking->channel,
                // Present-and-null clears; absent leaves alone. `??` made the
                // two the same, so a note could never be removed.
                'notes' => array_key_exists('notes', $input) ? $input['notes'] : $booking->notes,
            ]);
            // The price is a snapshot of the service booked; a different
            // service is a different price.
            // A new length or a new hour can change the price too (a longer
            // game, the peak) — but never under a booking already paid for.
            $durationChanged = $duration !== $booking->duration_min;
            if ($serviceChanged || $durationChanged
                || (! $start->equalTo($booking->start_at) && $booking->payment_status === 'unpaid')) {
                $booking->price_minor = $this->pricing->priceFor($service, $start, $duration);
            }
            $booking->duration_min = $duration;
            $booking->start_at = $start;
            $booking->end_at = $end;
            $booking->save();

            $this->recordChanges($booking, $before, $actorId, $statusEvent);

            return $booking->load('events');
        });
    }

    /** An entry in the history that changes nothing else — a customer confirming, a note. */
    public function record(Booking $booking, string $type, string $summary, ?int $actorId = null): Booking
    {
        $this->event($booking, $type, $summary, $actorId);

        return $booking->load('events');
    }

    /** "الأحد 10:00" in the organization's zone — what the operator saw on screen. */
    private function wallClock(Booking $booking, CarbonInterface $at): string
    {
        $tz = \App\Models\Organization::query()->whereKey($booking->org_id)->value('timezone') ?? 'UTC';
        $local = $at->copy()->setTimezone($tz)->locale('ar');

        return $local->translatedFormat('l').' '.$local->format('j/n H:i');
    }

    /** The trigger that used to do this in Postgres, in one place instead of two. */
    private function recordChanges(Booking $now, Booking $before, ?int $actorId, ?array $statusEvent = null): void
    {
        if ($now->status !== $before->status && $statusEvent) {
            $this->event($now, $statusEvent['type'], $statusEvent['summary'], $actorId);
        } elseif ($now->status !== $before->status) {
            $type = match ($now->status) {
                'confirmed' => 'confirmed',
                'completed' => 'completed',
                'cancelled' => 'cancelled',
                'no_show' => 'no_show',
                default => 'note_added',
            };
            $this->event($now, $type, match ($now->status) {
                'pending' => 'أُعيد الحجز إلى الانتظار',
                'confirmed' => 'تم تأكيد الحجز',
                'completed' => 'اكتملت الخدمة',
                'cancelled' => 'أُلغي الحجز',
                'no_show' => 'لم يحضر العميل',
                default => 'تغيّرت حالة الحجز',
            }, $actorId);
        }

        if ($now->payment_status !== $before->payment_status) {
            $this->event($now, 'payment_recorded', match ($now->payment_status) {
                'unpaid' => 'أُلغي تسجيل الدفع',
                'deposit_paid' => 'سُجّل عربون',
                'paid' => 'سُجّل الدفع كاملاً',
                'refunded' => 'تمت إعادة المبلغ',
                default => 'تغيّرت حالة الدفع',
            }, $actorId);
        }

        if (! $now->start_at->equalTo($before->start_at) || $now->resource_id !== $before->resource_id) {
            $this->event($now, 'rescheduled', sprintf(
                'أُعيدت جدولة الحجز من %s إلى %s',
                $this->wallClock($now, $before->start_at),
                $this->wallClock($now, $now->start_at),
            ), $actorId);
        }

        if ($now->service_id !== $before->service_id) {
            $this->event($now, 'note_added', 'تغيّرت الخدمة', $actorId);
        }

        if (($now->notes ?? '') !== ($before->notes ?? '')) {
            $this->event($now, 'note_added', 'أُضيفت ملاحظة', $actorId);
        }
    }
}
