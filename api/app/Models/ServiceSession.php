<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** A class's weekly time: Sunday 07:00, with this trainer or in this hall. */
class ServiceSession extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'org_id', 'service_id', 'resource_id', 'weekday', 'start_time'];

    protected function casts(): array
    {
        return ['weekday' => 'integer'];
    }
}
