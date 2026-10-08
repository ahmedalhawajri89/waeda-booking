<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use App\Services\Guard\GuardEngine;
use App\Services\Subscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Plans: a trial that ends on its own, messages that run out without
 * bookings stopping, seats that are counted, and upgrades that are asked for.
 */
class SubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Service $service;
    private Resource $room;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Salon', 'slug' => 'salon', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->operator = new User();
        $this->operator->fill(['name' => 'op', 'email' => 'op@example.com', 'password' => 'password']);
        $this->operator->org_id = $this->org->id;
        $this->operator->role = 'operator';
        $this->operator->save();

        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Chair']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Cut',
            'duration_min' => 30, 'buffer_min' => 0, 'price_minor' => 5000,
        ]);
        $this->service->resources()->sync([$this->room->id]);
        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '00:00', 'close_time' => '23:55', 'is_closed' => false,
            ]);
        }
    }

    private function sub(): Subscription
    {
        return app(Subscription::class);
    }

    private function endTrial(string $plan = 'free'): void
    {
        DB::table('organizations')->where('id', $this->org->id)->update(['trial_ends_at' => now()->subDay(), 'plan' => $plan]);
    }

    private ?Booking $filler = null;

    /** n outbound messages this month, on a booking of their own. */
    private function sent(int $n): void
    {
        $this->filler ??= $this->booking('0500000001');
        $rows = [];
        for ($i = 0; $i < $n; $i++) {
            $rows[] = [
                'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'booking_id' => $this->filler->id, 'direction' => 'out',
                'template' => 'reminder', 'body' => 'x', 'channel' => 'log', 'sent_at' => now(), 'needs_staff' => false,
            ];
        }
        DB::table('guard_messages')->insert($rows);
    }

    private function booking(string $phone = '0501234567'): Booking
    {
        $customer = Customer::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'نورة', 'phone' => $phone]);

        return Booking::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'reference' => 'BK-2030-0'.random_int(100, 999),
            'customer_id' => $customer->id, 'service_id' => $this->service->id, 'resource_id' => $this->room->id,
            // Far enough apart that the filler and the real booking never overlap.
            'start_at' => now()->addHours($phone === '0501234567' ? 3 : 30),
            'end_at' => now()->addHours($phone === '0501234567' ? 3 : 30)->addMinutes(30),
            'status' => 'confirmed', 'payment_status' => 'unpaid', 'price_minor' => 5000, 'channel' => 'phone',
        ]);
    }

    public function test_a_new_business_starts_on_a_pro_trial_that_ends_on_its_own(): void
    {
        $e = $this->sub()->effective($this->org->id);
        $this->assertSame('pro', $e['key']);
        $this->assertTrue($e['in_trial']);

        $this->travel(15)->days();
        $e = $this->sub()->effective($this->org->id);
        $this->assertSame('free', $e['key']);
        $this->assertFalse($e['in_trial']);
    }

    public function test_out_of_messages_the_guard_goes_quiet_but_bookings_carry_on(): void
    {
        $this->endTrial('free');
        $this->sent(50);
        $b = $this->booking();

        $this->assertSame(0, app(GuardEngine::class)->tick($this->org->id));
        $this->assertSame(0, DB::table('guard_messages')->where('booking_id', $b->id)->count());

        // And a guest can still book.
        $this->postJson('/api/public/bookings', [
            'serviceId' => $this->service->id, 'resourceId' => $this->room->id,
            'startAt' => Carbon::now('Asia/Riyadh')->addDays(2)->setTime(10, 0)->toIso8601String(),
            'name' => 'سعد', 'phone' => '0507654321',
        ])->assertCreated();
    }

    public function test_a_reply_from_the_team_says_why_it_did_not_go(): void
    {
        $this->endTrial('free');
        $this->sent(50);
        $b = $this->booking();

        $this->actingAs($this->operator, 'sanctum')
            ->postJson("/api/guard/conversations/{$b->id}/messages", ['body' => 'أهلاً'])
            ->assertStatus(422)->assertJsonPath('error', 'message_quota');
    }

    public function test_a_message_pack_raises_the_allowance_for_this_month(): void
    {
        $this->endTrial('free');
        $this->sent(50);
        $this->assertFalse($this->sub()->canSend($this->org->id));

        $this->sub()->activate($this->org->id, null, 'monthly', 500);

        $this->assertTrue($this->sub()->canSend($this->org->id));
        $this->assertSame(550, $this->sub()->messageAllowance($this->org->id));
    }

    public function test_seats_are_counted_and_switched_off_staff_are_free(): void
    {
        $this->endTrial('free');
        $other = ['id' => (string) Str::uuid(), 'name' => 'ريم', 'isActive' => true];
        $mine = ['id' => $this->room->id, 'name' => 'Chair', 'isActive' => true];

        $this->actingAs($this->operator, 'sanctum')
            ->putJson('/api/catalog', ['resources' => [$mine, $other]])
            ->assertStatus(422)->assertJsonPath('error', 'staff_limit');

        $this->actingAs($this->operator, 'sanctum')
            ->putJson('/api/catalog', ['resources' => [$mine, ['isActive' => false] + $other]])
            ->assertNoContent();
    }

    public function test_refilling_freed_slots_needs_a_paid_plan(): void
    {
        $this->endTrial('free');
        $this->assertFalse($this->sub()->allows($this->org->id, 'refill'));

        $this->sub()->activate($this->org->id, 'basic');
        $this->assertTrue($this->sub()->allows($this->org->id, 'refill'));
        $this->assertFalse($this->sub()->allows($this->org->id, 'deposits'));
    }

    public function test_an_upgrade_is_requested_then_activated(): void
    {
        $this->actingAs($this->operator, 'sanctum')
            ->postJson('/api/subscription/requests', ['plan' => 'basic', 'cycle' => 'yearly'])
            ->assertCreated()
            ->assertJsonPath('pending.plan', 'basic')
            ->assertJsonPath('pending.cycle', 'yearly');

        Artisan::call('waeda:activate', ['slug' => 'salon', 'plan' => 'basic', '--cycle' => 'yearly']);

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/subscription')
            ->assertJsonPath('plan', 'basic')
            ->assertJsonPath('cycle', 'yearly')
            ->assertJsonPath('trialEndsAt', null)
            ->assertJsonPath('pending', null);
    }

    public function test_the_subscription_reports_usage(): void
    {
        $this->sent(3);

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/subscription')
            ->assertOk()
            ->assertJsonPath('usage.messages', 3)
            ->assertJsonPath('usage.staff', 1);
    }

    public function test_nothing_requested_is_refused(): void
    {
        $this->actingAs($this->operator, 'sanctum')->postJson('/api/subscription/requests', [])->assertStatus(422);
    }
}
