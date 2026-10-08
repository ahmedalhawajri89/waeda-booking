<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    use HasUuids;

    protected $fillable = [
        'id', 'org_id', 'name', 'category', 'description', 'duration_min',
        'buffer_min', 'price_minor', 'icon_key', 'is_active', 'sort_order',
        'duration_options', 'peak_from', 'peak_price_minor', 'capacity',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'duration_min' => 'integer',
            'buffer_min' => 'integer',
            'price_minor' => 'integer',
            'duration_options' => 'array',
            'peak_price_minor' => 'integer',
            'capacity' => 'integer',
        ];
    }

    public function resources()
    {
        return $this->belongsToMany(Resource::class, 'service_resources', 'service_id', 'resource_id');
    }

    /**
     * How long this service occupies a resource: the appointment plus its
     * turnaround. A booking may have chosen one of the offered durations.
     */
    public function occupiedMinutes(?int $duration = null): int
    {
        return ($duration ?? $this->duration_min) + $this->buffer_min;
    }

    /** When a class runs each week: a day, a time, and who or where. */
    public function sessions()
    {
        return $this->hasMany(ServiceSession::class)->orderBy('weekday')->orderBy('start_time');
    }

    /** A class: more than one seat at the same time. */
    public function isGroup(): bool
    {
        return ($this->capacity ?? 1) > 1;
    }

    /** The lengths a customer can choose; just the one when none are offered. */
    public function durations(): array
    {
        return $this->duration_options ?: [$this->duration_min];
    }
}
