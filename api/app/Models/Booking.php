<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    use HasUuids;

    /** Statuses that occupy their slot. Cancelled and no-show release the time. */
    public const BLOCKING = ['pending', 'confirmed'];

    protected $fillable = [
        'id', 'org_id', 'reference', 'customer_id', 'service_id', 'resource_id',
        'start_at', 'end_at', 'status', 'payment_status', 'price_minor',
        'channel', 'notes', 'duration_min', 'series_id',
    ];

    protected function casts(): array
    {
        return [
            'start_at' => 'datetime',
            'end_at' => 'datetime',
            'price_minor' => 'integer',
            'duration_min' => 'integer',
            'acknowledged_at' => 'datetime',
        ];
    }

    /**
     * Someone at the business has a booking only when they made it. One that
     * came from the public page, or that the guard filled from the waitlist,
     * waits for the business to see it.
     */
    protected static function booted(): void
    {
        static::creating(function (Booking $b) {
            if ($b->acknowledged_at === null && $b->channel !== 'online') {
                $b->acknowledged_at = now();
            }
        });
    }

    /** The business has seen it. Idempotent: the first time is the one kept. */
    public function acknowledge(): self
    {
        if ($this->acknowledged_at === null) {
            $this->forceFill(['acknowledged_at' => now()])->save();
        }

        return $this;
    }

    public function events()
    {
        return $this->hasMany(BookingEvent::class)->orderBy('at');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function resource()
    {
        return $this->belongsTo(Resource::class);
    }
}
