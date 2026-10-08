<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Subscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The business's own plan: what it is on, what it has used, and asking for
 * more. Until a payment gateway is connected, asking is a request someone at
 * Waeda activates (php artisan waeda:activate); the page says so.
 */
class SubscriptionController extends Controller
{
    public function __construct(private Subscription $subscription)
    {
    }

    public function show(Request $request)
    {
        $org = $this->orgId($request);
        $e = $this->subscription->effective($org);
        $u = $this->subscription->usage($org);
        $pending = DB::table('plan_requests')->where('org_id', $org)->where('status', 'pending')
            ->orderByDesc('created_at')->first();

        return response()->json([
            'plan' => $e['paid'],
            'cycle' => $e['cycle'],
            'trialEndsAt' => $e['trial_ends_at']?->toIso8601String(),
            'usage' => [
                'messages' => $u['messages'],
                'extraMessages' => $u['extra_messages'],
                'staff' => $u['staff'],
            ],
            'pending' => $pending ? [
                'plan' => $pending->plan,
                'cycle' => $pending->cycle,
                'extraPack' => (bool) $pending->extra_pack,
                'at' => $pending->created_at,
            ] : null,
        ]);
    }

    public function request(Request $request)
    {
        $data = $request->validate([
            'plan' => ['nullable', 'in:'.implode(',', array_keys(config('plans.plans')))],
            'cycle' => ['sometimes', 'in:monthly,yearly'],
            'extraPack' => ['sometimes', 'boolean'],
        ]);
        if (empty($data['plan']) && empty($data['extraPack'])) {
            return response()->json(['error' => 'nothing_requested'], 422);
        }

        $org = $this->orgId($request);
        // One open request at a time: a new one replaces what was pending.
        DB::table('plan_requests')->where('org_id', $org)->where('status', 'pending')->delete();
        DB::table('plan_requests')->insert([
            'id' => (string) Str::uuid(),
            'org_id' => $org,
            'plan' => $data['plan'] ?? null,
            'cycle' => $data['cycle'] ?? 'monthly',
            'extra_pack' => (bool) ($data['extraPack'] ?? false),
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->show($request)->setStatusCode(201);
    }
}
