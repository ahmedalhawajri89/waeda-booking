<?php

namespace App\Providers;

use App\Channels\LogChannel;
use Anthropic\Client;
use App\Channels\MessageChannel;
use App\Services\Guard\ClaudeUnderstanding;
use App\Services\Guard\ReplyUnderstanding;
use App\Services\Guard\RuleUnderstanding;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // The guard's outbound channel, chosen by config/guard.php. Providers
        // (WhatsApp, SMS) are added to this match as they are connected.
        $this->app->bind(MessageChannel::class, fn () => match (config('guard.channel')) {
            default => new LogChannel(),
        });

        // How replies are read: Claude when a key is configured, word lists
        // otherwise. ClaudeUnderstanding falls back to the rules itself, so the
        // guard keeps working through any outage on the model's side.
        $this->app->bind(ReplyUnderstanding::class, fn ($app) => config('guard.ai_key')
            ? new ClaudeUnderstanding(
                new Client(apiKey: config('guard.ai_key')),
                $app->make(RuleUnderstanding::class),
                config('guard.ai_model'),
            )
            : $app->make(RuleUnderstanding::class));
    }

    public function boot(): void
    {
        //
    }
}
