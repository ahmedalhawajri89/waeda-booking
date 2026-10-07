<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** The thing that can be double-booked: a room, a chair, a practitioner. */
class Resource extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'org_id', 'name', 'role', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
