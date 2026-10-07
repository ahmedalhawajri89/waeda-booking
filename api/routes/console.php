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
        $sent += $guard->tick($org);
    }
    $this->info("guard: {$sent} message(s) sent");
})->purpose('Run the appointment guard for every organization');

Illuminate\Support\Facades\Schedule::command('guard:tick')->everyFiveMinutes()->withoutOverlapping();
