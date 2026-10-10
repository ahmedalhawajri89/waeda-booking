<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
| The appointment guard: reminders, confirmation requests and releases go out
| when they are due, not when someone happens to open the console. Each run is
| idempotent (see GuardEngine), so overlapping runs are harmless — the
| withoutOverlapping() below just saves the work.
*/
Artisan::command('guard:tick', function (App\Services\Guard\GuardEngine $guard) {
    $sent = 0;
    foreach (App\Models\Organization::query()->pluck('id') as $org) {
        // One business's bad row must not silence the guard for every
        // business after it: report it and carry on.
        try {
            $sent += $guard->tick($org);
        } catch (Throwable $e) {
            report($e);
        }
    }
    $this->info("guard: {$sent} message(s) sent");
})->purpose('Run the appointment guard for every organization');

Illuminate\Support\Facades\Schedule::command('guard:tick')->everyFiveMinutes()->withoutOverlapping();

/*
| Turning a plan on, until payments are connected: what a successful payment
| will do. `--messages=500` adds a message pack for the current month.
|   php artisan waeda:activate alrayhan basic --cycle=yearly
*/
Artisan::command('waeda:activate {slug} {plan?} {--cycle=monthly} {--messages=0}', function (App\Services\Subscription $subscription) {
    $org = App\Models\Organization::where('slug', $this->argument('slug'))->value('id');
    if (! $org) {
        return $this->error('No business with that link.');
    }
    $plan = $this->argument('plan');
    if ($plan && ! array_key_exists($plan, config('plans.plans'))) {
        return $this->error('Unknown plan. Use: '.implode(', ', array_keys(config('plans.plans'))));
    }
    $subscription->activate($org, $plan, $this->option('cycle'), (int) $this->option('messages'));
    $this->info('Activated.');
})->purpose('Activate a plan or a message pack for a business');
