<?php

namespace App\Services\Guard;

use App\Models\Booking;
use App\Models\Organization;
use App\Services\Hours;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Times a booking could move to — findOptions() in src/lib/guardBackend.js,
 * built on the same grid generateSlots() draws on the client: 30-minute
 * steps inside the day's opening hours, long enough for the service and its
 * buffer, clear of every blocking booking on the same resource, not past.
 *
 * Offering a time is not holding it. Whatever is offered is re-checked under
 * the resource lock when the customer picks it (BookingWriter::update).
 */
class SlotFinder
{
    private const STEP = 30;

    public function __construct(private Hours $hours)
    {
    }

    /**
     * @param  array{day?: string, window?: array{int, int}, time?: int}  $wish
     * @return array{options: list<Carbon>, fallback: bool}
     */
    public function find(Booking $b, array $wish, CarbonInterface $now): array
    {
        $b->loadMissing('service');
        $tz = Organization::query()->whereKey($b->org_id)->value('timezone') ?? 'UTC';
        $local = Carbon::instance($now)->setTimezone($tz);
        $start = isset($wish['day']) ? Carbon::parse($wish['day'], $tz)->startOfDay() : $local->copy()->startOfDay();

        $fits = function (Carbon $s) use ($wish, $tz) {
            $m = $this->minutes($s, $tz);

            return ! isset($wish['window']) || ($m >= $wish['window'][0] && $m < $wish['window'][1]);
        };
        $byCloseness = function (array $list) use ($wish, $tz) {
            if (! isset($wish['time'])) {
                return $list;
            }
            usort($list, fn ($x, $y) => abs($this->minutes($x, $tz) - $wish['time']) <=> abs($this->minutes($y, $tz) - $wish['time']));

            return $list;
        };
        $pick = fn (array $list) => array_slice($list, 0, 3);

        if (isset($wish['day'])) {
            $sameDay = $this->free($b, $start, $now, $tz);
            $wanted = $byCloseness(array_values(array_filter($sameDay, $fits)));
            if ($wanted) {
                return ['options' => $pick($wanted), 'fallback' => false];
            }
            if ($sameDay) {
                return ['options' => $pick($byCloseness($sameDay)), 'fallback' => true];
            }
        } else {
            for ($i = 0; $i < 7; $i++) {
                $wanted = $byCloseness(array_values(array_filter($this->free($b, $start->copy()->addDays($i), $now, $tz), $fits)));
                if ($wanted) {
                    return ['options' => $pick($wanted), 'fallback' => false];
                }
            }
        }

        $any = [];
        for ($i = isset($wish['day']) ? 1 : 0; $i < 8 && count($any) < 3; $i++) {
            array_push($any, ...$this->free($b, $start->copy()->addDays($i), $now, $tz));
        }

        return ['options' => $pick($any), 'fallback' => true];
    }

    /** @return list<Carbon> free starts on one local day, in order */
    private function free(Booking $b, Carbon $day, CarbonInterface $now, string $tz): array
    {
        // The business day starting on $day, which may close after midnight.
        $w = $this->hours->windowFor($b->org_id, $day);
        if (! $w) {
            return [];
        }

        $open = $w['open']->copy();
        $close = $w['close']->copy();
        $length = $b->service->occupiedMinutes($b->duration_min);

        $busy = Booking::query()
            ->where('resource_id', $b->resource_id)
            ->whereIn('status', Booking::BLOCKING)
            ->whereKeyNot($b->id)
            ->where('start_at', '<', $close->copy()->utc())
            ->where('end_at', '>', $open->copy()->utc())
            ->get(['start_at', 'end_at']);

        $out = [];
        for ($s = $open->copy(); $s->copy()->addMinutes($length)->lte($close); $s->addMinutes(self::STEP)) {
            $e = $s->copy()->addMinutes($length);
            if ($s->lt($now) || $s->equalTo($b->start_at)) {
                continue;
            }
            $taken = $busy->contains(fn ($x) => $s->lt($x->end_at) && $x->start_at->lt($e))
                || collect($w['breaks'])->contains(fn ($x) => $s->lt($x['end']) && $x['start']->lt($e));
            if (! $taken) {
                $out[] = $s->copy()->utc();
            }
        }

        return $out;
    }

    private function minutes(Carbon $at, string $tz): int
    {
        $l = $at->copy()->setTimezone($tz);

        return (int) $l->format('G') * 60 + (int) $l->format('i');
    }
}
