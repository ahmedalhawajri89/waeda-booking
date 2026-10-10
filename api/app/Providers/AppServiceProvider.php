<?php

namespace App\Providers;

use App\Channels\LogChannel;
use Anthropic\Client;
use App\Channels\MessageChannel;
use App\Services\Guard\AiUnderstanding;
use App\Services\Guard\ReplyUnderstanding;
use App\Services\Guard\RuleUnderstanding;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;
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

        // How replies are read: a language model when one is configured, word
        // lists otherwise. AiUnderstanding falls back to the rules itself, so the
        // guard keeps working through any outage on the model's side.
        $this->app->bind(ReplyUnderstanding::class, fn ($app) => config('guard.ai_key') && config('guard.ai_model')
            ? new AiUnderstanding(
                // Read inside a request, so a stalled model must fail fast and
                // fall back to the rules. The SDK leaves timeouts to its HTTP
                // client, hence the Guzzle instance rather than a bare option.
                new Client(apiKey: config('guard.ai_key'), requestOptions: [
                    'transporter' => new \GuzzleHttp\Client(['timeout' => 8, 'connect_timeout' => 3]),
                    'maxRetries' => 1,
                ]),
                $app->make(RuleUnderstanding::class),
                config('guard.ai_model'),
            )
            : $app->make(RuleUnderstanding::class));
    }

    public function boot(): void
    {
        // The reset link opens the app's own page, which posts the token back.
        $link = fn ($user, string $token) => config('app.frontend_url')
            .'/reset-password?'.http_build_query(['token' => $token, 'email' => $user->getEmailForPasswordReset()]);
        ResetPassword::createUrlUsing($link);

        ResetPassword::toMailUsing(function ($user, string $token) use ($link) {
            $url = $link($user, $token);
            $minutes = config('auth.passwords.'.config('auth.defaults.passwords').'.expire');

            return (new MailMessage)
                ->subject('إعادة تعيين كلمة المرور · وعدة')
                ->greeting('أهلاً '.$user->name)
                ->line('وصلنا طلب لإعادة تعيين كلمة مرور حسابك في وعدة.')
                ->action('عيّن كلمة مرور جديدة', $url)
                ->line("الرابط صالح لمدة {$minutes} دقيقة.")
                ->line('إن لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.')
                ->salutation('فريق وعدة');
        });
    }
}
