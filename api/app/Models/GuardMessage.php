<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class GuardMessage extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'id', 'org_id', 'booking_id', 'customer_id', 'reply_to', 'direction', 'template', 'body',
        'intent', 'payload', 'needs_staff', 'channel', 'sent_at', 'once_key',
    ];

    protected function casts(): array
    {
        return ['sent_at' => 'datetime', 'needs_staff' => 'boolean', 'payload' => 'array'];
    }

    /** The shape src/lib/guardEngine.js calls a Message. */
    public function toDomain(): array
    {
        return [
            'id' => $this->id,
            'bookingId' => $this->booking_id,
            'direction' => $this->direction,
            'template' => $this->template,
            'body' => $this->body,
            'at' => $this->sent_at->toIso8601String(),
            'intent' => $this->intent,
            'needsStaff' => $this->needs_staff,
            'payload' => $this->payload,
            'customerId' => $this->customer_id,
            'replyTo' => $this->reply_to,
        ];
    }
}
