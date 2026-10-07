<?php

namespace App\Services\Guard;

use App\Models\Booking;
use App\Models\GuardMessage;
use App\Models\WaitlistEntry;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Filling a freed slot — src/lib/waitlist.js on the server. Which cancelled
 * bookings are still worth selling, and who to offer each to: the waitlist
 * first (oldest wait first), then the service's regulars (most visits first),
 * never the customer who gave it up nor anyone already booked that day.
 */
class Backfill
{
    public const MIN_NOTICE_MINUTES = 60;
    public const OFFER_TO = 3;

    /**
     * @param  Collection<int, Booking>  $bookings  the organization's bookings
     * @return Collection<int, Booking>
     */
    public function freedSlots(Collection $bookings, CarbonInterface $now): Collection
    {
        $offered = GuardMessage::whereIn('booking_id', $bookings->where('status', 'cancelled')->pluck('id'))
            ->where('template', 'backfill_offer')->pluck('booking_id')->flip();

        return $bookings->filter(fn (Booking $b) => $b->status === 'cancelled'
            && $b->start_at->diffInMinutes($now, true) >= self::MIN_NOTICE_MINUTES
            && $b->start_at->gt($now)
            && ! $offered->has($b->id)
            && ! $this->taken($b, $bookings));
    }

    /** Has the freed time been booked again — by anyone? */
    public function taken(Booking $freed, Collection $bookings): bool
    {
        return $bookings->contains(fn (Booking $b) => $b->id !== $freed->id
            && $b->resource_id === $freed->resource_id
            && in_array($b->status, Booking::BLOCKING, true)
            && $b->start_at->lt($freed->end_at) && $freed->start_at->lt($b->end_at));
    }

    /**
     * @return list<array{customerId: string, entryId: ?string, reason: string}>
     */
    public function candidates(Booking $slot, Collection $bookings, string $tz, CarbonInterface $now): array
    {
        $local = $slot->start_at->copy()->setTimezone($tz);
        $day = $local->format('Y-m-d');
        $minutes = (int) $local->format('G') * 60 + (int) $local->format('i');

        $busy = $bookings
            ->filter(fn (Booking $b) => in_array($b->status, Booking::BLOCKING, true)
                && $b->start_at->copy()->setTimezone($tz)->format('Y-m-d') === $day)
            ->pluck('customer_id')->flip();

        $out = [];
        $add = function (string $customerId, ?string $entryId, string $reason) use (&$out, $slot, $busy) {
            if (count($out) >= self::OFFER_TO || $customerId === $slot->customer_id || $busy->has($customerId)
                || in_array($customerId, array_column($out, 'customerId'), true)) {
                return;
            }
            $out[] = ['customerId' => $customerId, 'entryId' => $entryId, 'reason' => $reason];
        };

        WaitlistEntry::where('org_id', $slot->org_id)->where('status', 'waiting')
            ->where('service_id', $slot->service_id)
            ->where(fn ($q) => $q->whereNull('day')->orWhereDate('day', $day))
            ->where(fn ($q) => $q->whereNull('window_from')
                ->orWhere(fn ($q) => $q->where('window_from', '<=', $minutes)->where('window_to', '>', $minutes)))
            ->orderBy('created_at')->get()
            ->each(fn (WaitlistEntry $e) => $add($e->customer_id, $e->id, 'waitlist'));

        $since = $now->copy()->subDays(90);
        $bookings->filter(fn (Booking $b) => $b->status === 'completed' && $b->service_id === $slot->service_id && $b->start_at->gte($since))
            ->countBy('customer_id')
            ->filter(fn (int $n) => $n >= 2)
            ->sortDesc()
            ->each(fn ($n, $customerId) => $add($customerId, null, 'regular'));

        return $out;
    }
}
