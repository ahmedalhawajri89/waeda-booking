<?php

namespace App\Services;

use App\Exceptions\InvalidBooking;
use App\Models\Resource;
use App\Models\Service;
use Carbon\CarbonInterface;

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
    public function __construct(private Hours $hours)
    {
    }

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

    /**
     * The desk may book into a prayer pause — a customer standing at the
     * counter is not turned away by a rule meant for the booking page.
     *
     * @throws InvalidBooking
     */
    public function withinHours(string $org, CarbonInterface $start, CarbonInterface $end, bool $respectBreaks = true): void
    {
        if (! $this->hours->isWithinHours($org, $start, $end, $respectBreaks)) {
            throw new InvalidBooking('outside_business_hours', 'That time is outside opening hours.');
        }
    }

    /**
     * The same rule generateSlots() applies on the client, enforced where the
     * client cannot be trusted — late nights and special periods included.
     */
    public function isWithinHours(string $org, CarbonInterface $start, CarbonInterface $end): bool
    {
        return $this->hours->isWithinHours($org, $start, $end);
    }
}
