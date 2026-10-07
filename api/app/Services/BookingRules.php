<?php

namespace App\Services;

use App\Exceptions\InvalidBooking;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * What makes a booking possible at all, independent of who is asking.
 *
 * These checks lived only in the public controller, so a booking the operator
 * created could sit outside opening hours, on a room the service does not use,
 * or on a service from another organization. The rules are the same for both
 * callers; only the past-time rule differs, and the caller decides that.
 */
class BookingRules
{
    /**
     * The service, if it belongs to the org and runs on the resource.
     *
     * @throws InvalidBooking
     */
    public function service(string $org, string $serviceId, string $resourceId, bool $mustBeActive = true): Service
    {
        $service = Service::with('resources:id')
            ->where('org_id', $org)
            ->whereKey($serviceId)
            ->when($mustBeActive, fn ($q) => $q->where('is_active', true))
            ->first();

        if (! $service) {
            throw new InvalidBooking('unknown_service', 'That service is not available.');
        }
        if (! $service->resources->contains('id', $resourceId)) {
            throw new InvalidBooking('resource_not_offered', 'That service does not run on this resource.');
        }

        return $service;
    }

    /** A room taken out of service takes no new bookings. @throws InvalidBooking */
    public function resourceIsActive(string $org, string $resourceId): void
    {
        $active = Resource::where('org_id', $org)->whereKey($resourceId)->where('is_active', true)->exists();
        if (! $active) {
            throw new InvalidBooking('resource_not_offered', 'That resource is not available.');
        }
    }

    /** @throws InvalidBooking */
    public function withinHours(string $org, CarbonInterface $start, CarbonInterface $end): void
    {
        if (! $this->isWithinHours($org, $start, $end)) {
            throw new InvalidBooking('outside_business_hours', 'That time is outside opening hours.');
        }
    }

    /**
     * The same rule isOpenOn()/generateSlots() apply on the client, enforced
     * where the client cannot be trusted. Weekday and wall-clock time only mean
     * something in the organization's own zone, so instants are converted first.
     */
    public function isWithinHours(string $org, CarbonInterface $start, CarbonInterface $end): bool
    {
        $tz = Organization::query()->whereKey($org)->value('timezone');
        if (! $tz) {
            return false;
        }

        $localStart = $start->copy()->setTimezone($tz);
        $localEnd = $end->copy()->setTimezone($tz);

        // A booking that crosses midnight cannot sit inside one day's hours.
        if (! $localStart->isSameDay($localEnd)) {
            return false;
        }

        $hours = DB::table('business_hours')
            ->where('org_id', $org)
            ->where('weekday', (int) $localStart->format('w'))
            ->first();

        if (! $hours || $hours->is_closed) {
            return false;
        }

        return $localStart->format('H:i:s') >= $hours->open_time
            && $localEnd->format('H:i:s') <= $hours->close_time;
    }
}
