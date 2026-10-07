<?php

namespace App\Services\Guard;

use App\Models\Booking;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * No-show risk, learned from the organization's own history.
 *
 * The server half of src/lib/risk.js — same factors, same shrinkage, same
 * fixed adjustment for a customer who confirmed. The guard runs here, on a
 * schedule, so the server has to reach the same verdict the console shows.
 * Read risk.js for the reasoning; this file only ports it.
 */
class RiskModel
{
    public const PRIOR_RATE = 0.12;
    private const BUCKET_PRIOR = 25;
    private const CUSTOMER_PRIOR = 4;
    /** Factors with many buckets need more evidence per bucket. */
    private const PRIORS = ['weekday' => 120, 'daypart' => 60];

    public readonly float $overall;
    public readonly int $settled;

    /** @var array<string, array{n:int, missed:int}> */
    private array $customers = [];
    /** @var array<string, array<string, array{n:int, missed:int}>> */
    private array $counts = [];

    /**
     * @param  Collection<int, Booking>  $bookings  with `events` loaded
     */
    public function __construct(Collection $bookings, private string $tz, private CarbonInterface $now)
    {
        $settled = $bookings
            ->filter(fn (Booking $b) => in_array($b->status, ['completed', 'no_show'], true) && $b->start_at->lt($now))
            ->sortBy(fn (Booking $b) => $b->start_at->getTimestamp())
            ->values();

        $missed = $settled->where('status', 'no_show')->count();
        $this->settled = $settled->count();
        $this->overall = self::clamp(($missed + self::PRIOR_RATE * self::BUCKET_PRIOR) / ($this->settled + self::BUCKET_PRIOR));

        foreach ($settled as $b) {
            $record = $this->customers[$b->customer_id] ?? ['n' => 0, 'missed' => 0];
            foreach ($this->buckets($b, $record['n']) as $feature => $bucket) {
                $c = $this->counts[$feature][$bucket] ?? ['n' => 0, 'missed' => 0];
                $c['n']++;
                if ($b->status === 'no_show') {
                    $c['missed']++;
                }
                $this->counts[$feature][$bucket] = $c;
            }
            $record['n']++;
            if ($b->status === 'no_show') {
                $record['missed']++;
            }
            $this->customers[$b->customer_id] = $record;
        }
    }

    /** Probability 0–1 that this booking is missed. */
    public function probability(Booking $b): float
    {
        $record = $this->customers[$b->customer_id] ?? ['n' => 0, 'missed' => 0];
        $base = self::clamp(($record['missed'] + $this->overall * self::CUSTOMER_PRIOR) / ($record['n'] + self::CUSTOMER_PRIOR));

        $total = self::logit($base);
        foreach ($this->buckets($b, $record['n']) as $feature => $bucket) {
            $total += $this->lift($feature, $bucket);
        }
        if ($b->events->contains('type', 'customer_confirmed')) {
            $total -= 1.6;
        }

        return self::clamp(1 / (1 + exp(-$total)));
    }

    /** @return array<string, string> */
    private function buckets(Booking $b, int $priorVisits): array
    {
        $local = $b->start_at->copy()->setTimezone($this->tz);
        $lead = ($b->start_at->getTimestamp() - $b->created_at->getTimestamp()) / 3600;
        $hour = (int) $local->format('G');

        return [
            'lead' => $lead >= 14 * 24 ? 'long' : ($lead >= 72 ? 'mid' : 'short'),
            'channel' => $b->channel,
            'prepaid' => $this->prepaid($b) ? 'yes' : 'no',
            'weekday' => $local->format('w'),
            'daypart' => $hour < 11 ? 'morning' : ($hour < 15 ? 'midday' : 'evening'),
            'visit' => $priorVisits === 0 ? 'first' : 'returning',
        ];
    }

    /** Paid before the appointment, not settled at the desk afterwards. */
    private function prepaid(Booking $b): bool
    {
        if ($b->start_at->gt($this->now)) {
            return in_array($b->payment_status, ['paid', 'deposit_paid'], true);
        }

        return $b->events->contains(fn ($e) => $e->type === 'payment_recorded' && $e->at->lt($b->start_at));
    }

    private function lift(string $feature, string $bucket): float
    {
        $c = $this->counts[$feature][$bucket] ?? null;
        if (! $c) {
            return 0.0;
        }
        $k = self::PRIORS[$feature] ?? self::BUCKET_PRIOR;
        $rate = self::clamp(($c['missed'] + $this->overall * $k) / ($c['n'] + $k));

        return self::logit($rate) - self::logit($this->overall);
    }

    private static function logit(float $p): float
    {
        return log($p / (1 - $p));
    }

    private static function clamp(float $p): float
    {
        return min(0.97, max(0.01, $p));
    }
}
