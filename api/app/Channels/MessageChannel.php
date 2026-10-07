<?php

namespace App\Channels;

/**
 * Where the guard's messages go out.
 *
 * One method, because that is all the guard needs: deliver this text to this
 * phone and say which channel did it. WhatsApp Cloud API, SMS and email are
 * implementations; the guard never knows which one is bound (see
 * AppServiceProvider and config/guard.php).
 */
interface MessageChannel
{
    /** The name stored with each message, e.g. "whatsapp". */
    public function name(): string;

    /** @throws \RuntimeException when the provider refuses the message */
    public function send(string $phone, string $body): void;
}
