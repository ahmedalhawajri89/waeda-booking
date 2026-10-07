<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class WaitlistEntry extends Model
{
    use HasUuids;

    protected $fillable = ['id', 'org_id', 'customer_id', 'service_id', 'day', 'window_from', 'window_to', 'status'];

    protected function casts(): array
    {
        return ['day' => 'date:Y-m-d', 'window_from' => 'integer', 'window_to' => 'integer'];
    }

    /** The shape src/lib/waitlist.js calls a WaitlistEntry. */
    public function toDomain(): array
    {
        return [
            'id' => $this->id,
            'customerId' => $this->customer_id,
            'serviceId' => $this->service_id,
            'day' => $this->day?->format('Y-m-d'),
            'window' => $this->window_from !== null ? [$this->window_from, $this->window_to] : null,
            'status' => $this->status,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
