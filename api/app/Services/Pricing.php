<?php

namespace App\Services;

use App\Models\Service;
use Carbon\CarbonInterface;

/**
 * What a booking costs — priceFor() in src/lib/pricing.js, case for case.
 *
 * The service's price is for its own duration; a longer one costs in
 * proportion. From the peak hour (say 17:00) the peak price applies, and a
 * booking after midnight on a late day is still evening, so still peak.
 * Only the server sets a booking's price: what a client sends is ignored.
 */
class Pricing
{
    public function __construct(private Hours $hours)
    {
    }

    public function priceFor(Service $service, CarbonInterface $start, ?int $duration = null): int
    {
        $base = $this->isPeak($service, $start) ? (int) $service->peak_price_minor : $service->price_minor;
        $duration ??= $service->duration_min;

        return (int) round($base * $duration / max(1, $service->duration_min));
    }

    public function isPeak(Service $service, CarbonInterface $start): bool
    {
        if (! $service->peak_from || $service->peak_price_minor === null) {
            return false;
        }
        // Minutes into the business day: 01:00 on a late night is 25 × 60.
        $day = $this->hours->businessDayOf($service->org_id, $start);
        $minutes = (int) floor(($start->getTimestamp() - $day->getTimestamp()) / 60);
        [$h, $m] = array_map('intval', explode(':', substr((string) $service->peak_from, 0, 5)));

        return $minutes >= $h * 60 + $m;
    }
}
