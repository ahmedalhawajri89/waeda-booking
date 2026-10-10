<?php

return [
    /*
    | Which MessageChannel carries the appointment guard's messages.
    | "log" writes them to the application log and sends nothing.
    */
    'channel' => env('GUARD_CHANNEL', 'log'),

    /*
    | Reading customers' replies. With an API key and a model name, a language
    | model reads them (falling back to the word lists on any failure); without
    | them, the word lists do. Nothing else changes either way.
    */
    'ai_key' => env('AI_API_KEY'),
    'ai_model' => env('AI_MODEL'),

    /*
    | Whether the phone-verification code is also returned to the page. On by
    | default only with the "log" channel, where no customer can receive it;
    | with a real channel connected the code reaches the phone and nothing else.
    */
    'otp_echo' => (bool) env('OTP_ECHO', env('GUARD_CHANNEL', 'log') === 'log'),
];
