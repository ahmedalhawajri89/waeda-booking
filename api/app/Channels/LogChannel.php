<?php

namespace App\Channels;

use Illuminate\Support\Facades\Log;

/**
 * Delivers to the application log. The default until a provider account is
 * connected, and what development and tests use: every message the guard
 * would send is recorded in guard_messages and visible in the console either
 * way, so the whole flow can be exercised without sending anything to anyone.
 */
class LogChannel implements MessageChannel
{
    public function name(): string
    {
        return 'log';
    }

    public function send(string $phone, string $body): void
    {
        Log::info('guard message', ['to' => $phone, 'body' => $body]);
    }
}
