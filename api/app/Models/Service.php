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
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'duration_min' => 'integer',
            'buffer_min' => 'integer',
            'price_minor' => 'integer',
        ];
    }

    public function resources()
    {
        return $this->belongsToMany(Resource::class, 'service_resources', 'service_id', 'resource_id');
    }

    /** How long this service occupies a resource: the appointment plus its turnaround. */
    public function occupiedMinutes(): int
    {
        return $this->duration_min + $this->buffer_min;
    }
}
