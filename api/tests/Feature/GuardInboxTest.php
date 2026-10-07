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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The inbox: a person on the team answering a customer in the guard's thread,
 * and closing a conversation the guard could not handle alone.
 */
class GuardInboxTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Clinic', 'slug' => 'c', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->operator = $this->user($this->org, 'op@example.com');
        $room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'استشارة',
            'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
        ]);
        $service->resources()->sync([$room->id]);
        $customer = Customer::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'سارة', 'phone' => '0501234567',
        ]);
        $this->booking = app(BookingWriter::class)->create([
            'org_id' => $this->org->id, 'customer_id' => $customer->id,
            'service_id' => $service->id, 'resource_id' => $room->id,
            'start_at' => Carbon::parse('2030-03-03 10:00:00', 'UTC'), 'status' => 'confirmed',
        ]);
    }

    private function user(Organization $org, string $email): User
    {
        $u = new User();
        $u->fill(['name' => 'ريم من الاستقبال', 'email' => $email, 'password' => 'password']);
        $u->org_id = $org->id;
        $u->role = 'operator';
        $u->save();

        return $u;
    }

    /** A reply the guard could not understand, waiting for a person. */
    private function handedOff(): GuardMessage
    {
        return GuardMessage::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'booking_id' => $this->booking->id,
            'direction' => 'in', 'template' => 'reply', 'body' => 'ممكن أجي مع أختي؟',
            'intent' => 'unknown', 'needs_staff' => true, 'channel' => 'log', 'sent_at' => now(),
        ]);
    }

    public function test_the_team_can_answer_in_the_customers_thread(): void
    {
        $this->handedOff();

        $this->actingAs($this->operator, 'sanctum')
            ->postJson("/api/guard/conversations/{$this->booking->id}/messages", ['body' => 'أهلاً سارة، تقدرين تجين مع أختك.'])
            ->assertCreated();

        $sent = GuardMessage::where('template', 'staff')->firstOrFail();
        $this->assertSame('out', $sent->direction);
        $this->assertSame($this->booking->id, $sent->booking_id);
        $this->assertSame('ريم من الاستقبال', $sent->payload['author']);
    }

    public function test_answering_closes_the_hand_off(): void
    {
        $waiting = $this->handedOff();

        $this->actingAs($this->operator, 'sanctum')
            ->postJson("/api/guard/conversations/{$this->booking->id}/messages", ['body' => 'تمام'])
            ->assertCreated();

        $this->assertFalse($waiting->fresh()->needs_staff);
    }

    public function test_a_conversation_can_be_marked_done_without_writing(): void
    {
        $waiting = $this->handedOff();

        $this->actingAs($this->operator, 'sanctum')
            ->postJson("/api/guard/conversations/{$this->booking->id}/resolve")
            ->assertOk();

        $this->assertFalse($waiting->fresh()->needs_staff);
        $this->assertSame(0, GuardMessage::where('template', 'staff')->count());
    }

    public function test_another_business_cannot_write_into_this_thread(): void
    {
        $other = Organization::create(['name' => 'Other', 'slug' => 'o', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $outsider = $this->user($other, 'out@example.com');

        $this->actingAs($outsider, 'sanctum')
            ->postJson("/api/guard/conversations/{$this->booking->id}/messages", ['body' => 'hi'])
            ->assertNotFound();
        $this->actingAs($outsider, 'sanctum')
            ->postJson("/api/guard/conversations/{$this->booking->id}/resolve")
            ->assertNotFound();
    }

    public function test_an_empty_reply_is_refused(): void
    {
        $this->actingAs($this->operator, 'sanctum')
            ->postJson("/api/guard/conversations/{$this->booking->id}/messages", ['body' => ''])
            ->assertStatus(422);
    }
}
