<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\Resource;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The plan a business is on, what it allows, and how much of it is used —
 * effectivePlan() and the subscription store on the client, enforced here.
 *
 * Bookings are never limited. Messages are, because each one costs money:
 * out of messages, the guard stops writing and the business is told. Staff
 * are, because seats are what the plans are priced on.
 */
class Subscription
{
    /** @return array{key: string, in_trial: bool, trial_ends_at: ?Carbon, limits: array} */
    public function effective(string $org): array
    {
        $o = Organization::query()->whereKey($org)->first(['plan', 'trial_ends_at', 'billing_cycle']);
        $trialEnds = $o?->trial_ends_at ? Carbon::parse($o->trial_ends_at) : null;
        $inTrial = $trialEnds && $trialEnds->isFuture();
        $key = $inTrial ? config('plans.trial_plan') : ($o?->plan ?? 'free');
        $key = array_key_exists($key, config('plans.plans')) ? $key : 'free';

        return [
            'key' => $key,
            'paid' => $o?->plan ?? 'free',
            'cycle' => $o?->billing_cycle ?? 'monthly',
            'in_trial' => (bool) $inTrial,
            'trial_ends_at' => $trialEnds,
            'limits' => config("plans.plans.$key"),
        ];
    }

    /** Messages sent this month (in the business's own month), and active staff. */
    public function usage(string $org): array
    {
        $o = Organization::query()->whereKey($org)->first(['timezone', 'extra_messages', 'extra_month']);
        $tz = $o?->timezone ?? 'UTC';
        $start = Carbon::now($tz)->startOfMonth()->utc();
        $month = Carbon::now($tz)->format('Y-m');

        return [
            'messages' => DB::table('guard_messages')->where('org_id', $org)->where('direction', 'out')
                ->where('sent_at', '>=', $start)->count(),
            'extra_messages' => $o && $o->extra_month === $month ? (int) $o->extra_messages : 0,
            'staff' => Resource::where('org_id', $org)->where('is_active', true)->count(),
        ];
    }

    public function messageAllowance(string $org): int
    {
        return $this->effective($org)['limits']['messages'] + $this->usage($org)['extra_messages'];
    }

    public function canSend(string $org): bool
    {
        return $this->usage($org)['messages'] < $this->messageAllowance($org);
    }

    public function staffLimit(string $org): int
    {
        return $this->effective($org)['limits']['staff'];
    }

    public function allows(string $org, string $feature): bool
    {
        return (bool) ($this->effective($org)['limits']['features'][$feature] ?? false);
    }

    /** Activate a plan (or add a pack) — what a payment will do; for now, a person. */
    public function activate(string $org, ?string $plan, string $cycle = 'monthly', int $extraMessages = 0): void
    {
        $tz = Organization::query()->whereKey($org)->value('timezone') ?? 'UTC';
        $month = Carbon::now($tz)->format('Y-m');
        $o = Organization::query()->whereKey($org)->first(['extra_messages', 'extra_month']);
        $update = [];
        if ($plan) {
            $update += ['plan' => $plan, 'billing_cycle' => $cycle, 'trial_ends_at' => null];
        }
        if ($extraMessages > 0) {
            $carried = $o->extra_month === $month ? (int) $o->extra_messages : 0;
            $update += ['extra_messages' => $carried + $extraMessages, 'extra_month' => $month];
        }
        if ($update) {
            DB::table('organizations')->where('id', $org)->update($update);
        }
        DB::table('plan_requests')->where('org_id', $org)->where('status', 'pending')
            ->update(['status' => 'activated', 'updated_at' => now()]);
    }
}
