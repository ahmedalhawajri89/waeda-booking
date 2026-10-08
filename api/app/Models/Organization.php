<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Organization extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'slug', 'category', 'address', 'timezone', 'currency'];

    protected function casts(): array
    {
        return ['trial_ends_at' => 'datetime'];
    }

    /** Every new business starts on a trial of the top plan. */
    protected static function booted(): void
    {
        static::creating(function (Organization $o) {
            $o->trial_ends_at ??= now()->addDays(config('plans.trial_days'));
        });
    }

    public function services()
    {
        return $this->hasMany(Service::class, 'org_id');
    }

    public function resources()
    {
        return $this->hasMany(Resource::class, 'org_id');
    }

    public function businessHours()
    {
        return $this->hasMany(BusinessHour::class, 'org_id')->orderBy('weekday');
    }
}
