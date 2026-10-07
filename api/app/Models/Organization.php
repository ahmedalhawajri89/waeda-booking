<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Organization extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'slug', 'category', 'address', 'timezone', 'currency'];

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
