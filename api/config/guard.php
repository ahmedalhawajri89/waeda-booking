<?php

return [
    /*
    | Which MessageChannel carries the appointment guard's messages.
    | "log" writes them to the application log and sends nothing.
    */
    'channel' => env('GUARD_CHANNEL', 'log'),

    /*
    | Reading customers' replies. With an Anthropic API key, Claude reads them
    | (falling back to the word lists on any failure); without one, the word
    | lists do. Nothing else changes either way.
    */
    'ai_key' => env('ANTHROPIC_API_KEY'),
    'ai_model' => env('GUARD_AI_MODEL', 'claude-opus-5-5'),
];
