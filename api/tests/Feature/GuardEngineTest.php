<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\GuardMessage;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use App\Services\BookingWriter;
use App\Services\Guard\GuardEngine;
use App\Services\Guard\GuardPolicy;
use App\Services\Guard\RuleUnderstanding;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The appointment guard on the server: what it sends and when, that it never
 * sends anything twice, what a release does, and what a reply does.
 */
class GuardEngineTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Customer $customer;
    private Service $service;
    private Resource $room;
    private GuardEngine $guard;

    /** The appointment every test is about: 10:00 UTC on a future day. */
    private Carbon $start;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Clinic', 'slug' => 'c', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->operator = $this->user($this->org, 'op@example.com', 'operator');
        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'استشارة',
            'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
        ]);
        $this->service->resources()->sync([$this->room->id]);
        $this->customer = Customer::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'سارة خالد', 'phone' => '0501234567',
        ]);
        $this->guard = app(GuardEngine::class);
        $this->start = Carbon::parse('2030-03-03 10:00:00', 'UTC');
    }

    private function user(Organization $org, string $email, string $role): User
    {
        $u = new User();
        $u->fill(['name' => $email, 'email' => $email, 'password' => 'password']);
        $u->org_id = $org->id;
        $u->role = $role;
        $u->save();

        return $u;
    }

    private function book(string $status = 'confirmed'): Booking
    {
        return app(BookingWriter::class)->create([
            'org_id' => $this->org->id, 'customer_id' => $this->customer->id,
            'service_id' => $this->service->id, 'resource_id' => $this->room->id,
            'start_at' => $this->start, 'status' => $status,
        ]);
    }

    private function policy(array $overrides): void
    {
        DB::table('guard_policies')->insert([
            'org_id' => $this->org->id,
            'policy' => json_encode($overrides + GuardPolicy::DEFAULTS),
        ]);
    }

    /** Run the guard as if it were `hours` before the appointment. */
    private function tickAt(float $hours): int
    {
        return $this->guard->tick($this->org->id, $this->start->copy()->subMinutes((int) round($hours * 60)));
    }

    private function sent(string $template): int
    {
        return GuardMessage::where('direction', 'out')->where('template', $template)->count();
    }

    /* ------------------------------------------------------------- tick */

    public function test_a_booking_is_reminded_once_inside_the_window(): void
    {
        $this->book();

        $this->assertSame(0, $this->tickAt(30));
        $this->assertSame(1, $this->tickAt(20));
        $this->assertSame(0, $this->tickAt(10), 'a second run must not send it again');
        $this->assertSame(1, $this->sent('reminder'));
    }

    public function test_the_reminder_is_addressed_and_timed_in_the_organizations_zone(): void
    {
        $this->book();
        $this->tickAt(20);

        // 10:00 UTC is 1:00 pm in Riyadh.
        $body = GuardMessage::first()->body;
        $this->assertStringContainsString('مرحباً سارة', $body);
        $this->assertStringContainsString('1:00 م', $body);
    }

    public function test_a_risky_booking_is_asked_to_confirm(): void
    {
        $this->policy(['mediumAt' => 0.01, 'highAt' => 0.9]);
        $this->book();

        $this->tickAt(2);

        $this->assertSame(1, $this->sent('confirm_request'));
        $this->assertStringContainsString('للتأكيد أرسل 1', GuardMessage::first()->body);
    }

    public function test_silence_releases_the_slot_when_the_policy_says_so(): void
    {
        $this->policy(['mediumAt' => 0.01, 'highAt' => 0.9, 'autoRelease' => true, 'releaseHoursBefore' => 2]);
        $booking = $this->book();

        $this->tickAt(2.5);   // asked to confirm
        $this->tickAt(1.5);   // no answer, inside the release window

        $booking->refresh();
        $this->assertSame('cancelled', $booking->status);
        $this->assertSame('released', $booking->events->last()->type);
        $this->assertSame(1, $this->sent('release_notice'));
    }

    public function test_nothing_is_released_without_the_policy(): void
    {
        $this->policy(['mediumAt' => 0.01, 'highAt' => 0.9]);
        $booking = $this->book();

        $this->tickAt(2.5);
        $this->tickAt(1);

        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    /* ------------------------------------------------------------ replies */

    public function test_a_yes_confirms_a_pending_booking_and_is_answered(): void
    {
        $booking = $this->book('pending');

        $result = $this->guard->reply($booking, 'أكيد جاي');

        $this->assertSame('confirm', $result['intent']);
        $this->assertSame('confirmed', $booking->fresh()->status);
        $this->assertTrue($booking->fresh()->events->contains('type', 'customer_confirmed'));
        $this->assertSame(1, $this->sent('ack_confirm'));
    }

    public function test_a_confirmed_customer_is_not_released(): void
    {
        $this->policy(['mediumAt' => 0.01, 'highAt' => 0.9, 'autoRelease' => true, 'releaseHoursBefore' => 2]);
        $booking = $this->book();

        $this->tickAt(2.5);
        $this->guard->reply($booking->fresh(), '1');
        $this->tickAt(1);

        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    public function test_a_no_cancels_and_frees_the_time(): void
    {
        $booking = $this->book();

        $this->guard->reply($booking, '2');

        $this->assertSame('cancelled', $booking->fresh()->status);
        $this->assertSame('ألغى العميل الحجز برسالة', $booking->fresh()->events->last()->summary);
    }

    public function test_what_it_cannot_read_goes_to_staff_and_changes_nothing(): void
    {
        $booking = $this->book();

        $this->guard->reply($booking, 'مين معي؟ عندي سؤال عن السعر');

        $this->assertSame('confirmed', $booking->fresh()->status);
        $this->assertTrue(GuardMessage::where('direction', 'in')->first()->needs_staff);
        $this->assertSame(1, $this->sent('ack_handoff'));
    }

    /* ---------------------------------------------------------- endpoints */

    public function test_the_console_can_run_the_guard_and_read_what_it_did(): void
    {
        $this->book();

        $this->actingAs($this->operator, 'sanctum')->postJson('/api/guard/tick')
            ->assertOk()->assertJsonStructure(['messages', 'bookings']);
        $this->actingAs($this->operator, 'sanctum')->getJson('/api/guard/messages')->assertOk();
    }

    public function test_a_reply_cannot_reach_another_organizations_booking(): void
    {
        $booking = $this->book();
        $rival = Organization::create(['name' => 'Rival', 'slug' => 'r', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);

        $this->actingAs($this->user($rival, 'r@example.com', 'operator'), 'sanctum')
            ->postJson('/api/guard/replies', ['bookingId' => $booking->id, 'text' => '2'])
            ->assertNotFound();
        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    public function test_the_guard_is_closed_to_customers(): void
    {
        $customer = $this->user($this->org, 'c@example.com', 'customer');

        $this->actingAs($customer, 'sanctum')->postJson('/api/guard/tick')->assertForbidden();
        $this->actingAs($customer, 'sanctum')->getJson('/api/guard/messages')->assertForbidden();
    }

    /* --------------------------------------------------------- interpreter */

    /** The same cases as src/lib/__tests__/guardEngine.spec.js — the two must agree. */
    public static function replies(): array
    {
        return [
            ['1', 'confirm'], ['نعم', 'confirm'], ['أكيد جاي', 'confirm'], ['تمام.', 'confirm'], ['👍', 'confirm'],
            ['2', 'cancel'], ['ألغيه لو سمحت', 'cancel'], ['ما بقدر اجي', 'cancel'],
            ['بتأخر ربع ساعة', 'late'], ['مين معي؟', 'unknown'], ['ممكن أغير الموعد للخميس', 'reschedule'],
            ['10 دقائق', 'unknown'],
        ];
    }

    #[DataProvider('replies')]
    public function test_replies_are_read_as_the_client_reads_them(string $text, string $intent): void
    {
        $this->assertSame($intent, (new RuleUnderstanding())->interpret($text));
    }
}
