<?php

namespace App\Services;

use App\Models\Organization;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * When a business day starts and ends — src/lib/hours.js, case for case.
 *
 * A close at or before the open is the next morning, so "16:00 to 02:00" is
 * one evening and a 1 a.m. booking belongs to it. A special period (Ramadan,
 * a holiday) replaces the week's hours on the dates it covers. Everything
 * that asks "is this inside opening hours" or "which times are free" asks
 * here, so the public form, the operator and the guard cannot disagree.
 *
 * All wall-clock reasoning happens in the organization's own zone.
 */
class Hours
{
    /** @var array<string, array{tz: string, week: array<int, object>, periods: list<array>, prayer: ?array}> */
    private array $orgs = [];

    /**
     * How far inside a prayer pause a booking must reach before the server
     * refuses it. The page hides the whole pause; the two libraries computing
     * it can disagree by a few minutes, and the server must never turn down a
     * time the page offered.
     */
    private const PRAYER_TOLERANCE_MIN = 5;

    public function __construct(private PrayerBreaks $prayer)
    {
    }

    /**
     * The business day that starts on this local date, or null when closed.
     *
     * @return array{day: Carbon, open: Carbon, close: Carbon, overnight: bool, breaks: list<array{start: Carbon, end: Carbon, label: string}>, period: ?array}|null
     */
    public function windowFor(string $org, CarbonInterface $date): ?array
    {
        $o = $this->load($org);
        $day = Carbon::parse($date->format('Y-m-d'), $o['tz'])->startOfDay();
        $period = $this->periodOn($o['periods'], $day->format('Y-m-d'));
        $row = $period
            ? collect($period['hours'])->firstWhere('weekday', (int) $day->format('w'))
            : $o['week'][(int) $day->format('w')] ?? null;
        if (! $row) {
            return null;
        }

        $row = (array) $row;
        $isClosed = (bool) ($row['isClosed'] ?? $row['is_closed'] ?? false);
        $open = substr((string) ($row['open'] ?? $row['open_time']), 0, 5);
        $close = substr((string) ($row['close'] ?? $row['close_time']), 0, 5);
        if ($isClosed || $open === $close) {
            return null;
        }

        $overnight = $close < $open;
        $openAt = Carbon::parse($day->format('Y-m-d').' '.$open, $o['tz']);
        $closeAt = Carbon::parse(($overnight ? $day->copy()->addDay() : $day)->format('Y-m-d').' '.$close, $o['tz']);

        $w = [
            'day' => $day,
            'open' => $openAt,
            'close' => $closeAt,
            'overnight' => $overnight,
            'breaks' => [],
            'period' => $period,
        ];
        $w['breaks'] = $this->prayer->within($w, $o['prayer'], $o['tz']);

        return $w;
    }

    /** 01:00 on Friday is Thursday's, when Thursday ran late. */
    public function businessDayOf(string $org, CarbonInterface $instant): Carbon
    {
        $local = Carbon::instance($instant)->setTimezone($this->load($org)['tz']);
        $yesterday = $this->windowFor($org, $local->copy()->subDay());
        if ($yesterday && $local->lt($yesterday['close'])) {
            return $yesterday['day'];
        }

        return $local->copy()->startOfDay();
    }

    /**
     * Inside one business day — the one it starts on, or the evening before —
     * and, unless the desk is booking it, clear of its prayer pauses.
     */
    public function isWithinHours(string $org, CarbonInterface $start, CarbonInterface $end, bool $respectBreaks = true): bool
    {
        if (! Organization::query()->whereKey($org)->exists()) {
            return false;
        }
        $local = Carbon::instance($start)->setTimezone($this->load($org)['tz']);

        foreach ([$local->copy()->startOfDay(), $local->copy()->startOfDay()->subDay()] as $day) {
            $w = $this->windowFor($org, $day);
            if (! $w || $start->lt($w['open']) || $end->gt($w['close'])) {
                continue;
            }
            foreach ($respectBreaks ? $w['breaks'] : [] as $b) {
                $from = $b['start']->copy()->addMinutes(self::PRAYER_TOLERANCE_MIN);
                $to = $b['end']->copy()->subMinutes(self::PRAYER_TOLERANCE_MIN);
                if ($start->lt($to) && $from->lt($end)) {
                    return false;
                }
            }

            return true;
        }

        return false;
    }

    /** Forget what was read — after Settings saves, within the same request. */
    public function forget(string $org): void
    {
        unset($this->orgs[$org]);
    }

    private function periodOn(array $periods, string $ymd): ?array
    {
        foreach ($periods as $p) {
            if ($p['startsOn'] <= $ymd && $ymd <= $p['endsOn']) {
                return $p;
            }
        }

        return null;
    }

    private function load(string $org): array
    {
        $row = Organization::query()->whereKey($org)->first(['timezone', 'prayer_breaks']);

        return $this->orgs[$org] ??= [
            'tz' => $row?->timezone ?? 'UTC',
            'prayer' => $row?->prayer_breaks ? json_decode($row->prayer_breaks, true) : null,
            'week' => DB::table('business_hours')->where('org_id', $org)->get()->keyBy('weekday')->all(),
            'periods' => DB::table('special_periods')->where('org_id', $org)->orderBy('starts_on')->get()
                ->map(fn ($p) => [
                    'id' => $p->id,
                    'label' => $p->label,
                    'startsOn' => substr((string) $p->starts_on, 0, 10),
                    'endsOn' => substr((string) $p->ends_on, 0, 10),
                    'hours' => json_decode($p->hours, true),
                ])->all(),
        ];
    }
}
