<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use App\Services\Guard\RuleUnderstanding;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * "Did the business get my booking?" — a guest's booking waits to be seen,
 * the guest's page says whether it has been, and moving it makes it new again.
 */
class BookingAcknowledgeTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Service $service;
    private Resource $room;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create([
            'name' => 'Test Clinic', 'slug' => 'test', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);
        $this->operator = new User();
        $this->operator->fill(['name' => 'op', 'email' => 'op@example.com', 'password' => 'password']);
        $this->operator->org_id = $this->org->id;
        $this->operator->role = 'operator';
        $this->operator->save();

        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Consultation',
            'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
        ]);
        $this->service->resources()->sync([$this->room->id]);
        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '09:00', 'close_time' => '18:00', 'is_closed' => false,
            ]);
        }
    }

    private function slot(string $time = '10:00'): Carbon
    {
        return Carbon::now('Asia/Riyadh')->addWeek()->startOfDay()->setTimeFromTimeString($time);
    }

    private function guestBooks(): Booking
    {
        $id = $this->postJson('/api/public/bookings', [
            'serviceId' => $this->service->id,
            'resourceId' => $this->room->id,
            'startAt' => $this->slot()->toIso8601String(),
            'name' => 'ريم الدوسري',
            'phone' => '0501234567',
            'verificationToken' => $this->phoneToken('0501234567'),
        ])->assertCreated()->json('id');

        return Booking::findOrFail($id);
    }

    private function guestView(Booking $b): array
    {
        $proof = $this->phoneToken('0501234567');

        return $this->getJson("/api/public/bookings/{$b->reference}?phone=0501234567&verificationToken={$proof}")
            ->assertOk()->json();
    }

    public function test_a_guest_booking_waits_to_be_seen(): void
    {
        $b = $this->guestBooks();

        $this->assertNull($b->acknowledged_at);
        $this->assertNull($this->guestView($b)['acknowledgedAt']);
    }

    public function test_acknowledging_tells_the_guest_it_arrived(): void
    {
        $b = $this->guestBooks();

        $this->actingAs($this->operator, 'sanctum')
            ->postJson("/api/bookings/{$b->id}/acknowledge")
            ->assertOk()
            ->assertJsonPath('id', $b->id);

        $this->assertNotNull($this->guestView($b)['acknowledgedAt']);
    }

    public function test_acknowledging_twice_keeps_the_first_time(): void
    {
        $b = $this->guestBooks();
        $this->actingAs($this->operator, 'sanctum')->postJson("/api/bookings/{$b->id}/acknowledge");
        $first = $b->fresh()->acknowledged_at;

        $this->travel(5)->minutes();
        $this->actingAs($this->operator, 'sanctum')->postJson("/api/bookings/{$b->id}/acknowledge");

        $this->assertTrue($first->equalTo($b->fresh()->acknowledged_at));
    }

    public function test_acting_on_a_booking_counts_as_seeing_it(): void
    {
        $b = $this->guestBooks();

        $this->actingAs($this->operator, 'sanctum')
            ->patchJson("/api/bookings/{$b->id}", ['status' => 'confirmed'])
            ->assertOk();

        $this->assertNotNull($b->fresh()->acknowledged_at);
    }

    public function test_a_booking_made_at_the_desk_is_already_seen(): void
    {
        $customer = \App\Models\Customer::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Sara', 'phone' => '0509999999',
        ]);

        $json = $this->actingAs($this->operator, 'sanctum')->postJson('/api/bookings', [
            'customerId' => $customer->id,
            'serviceId' => $this->service->id,
            'resourceId' => $this->room->id,
            'startAt' => $this->slot('12:00')->toIso8601String(),
            'channel' => 'online',
        ])->assertCreated()->json();

        $this->assertNotNull($json['acknowledgedAt']);
    }

    public function test_a_guest_moving_the_booking_makes_it_new_again(): void
    {
        $b = $this->guestBooks();
        $this->actingAs($this->operator, 'sanctum')->postJson("/api/bookings/{$b->id}/acknowledge");
        $this->app['auth']->forgetGuards();

        $this->postJson("/api/public/bookings/{$b->reference}/reschedule", [
            'phone' => '0501234567', 'verificationToken' => $this->phoneToken('0501234567'),
            'startAt' => $this->slot('14:00')->toIso8601String(),
        ])->assertOk()->assertJsonPath('acknowledgedAt', null);

        $this->assertNull($b->fresh()->acknowledged_at);
    }

    public function test_another_business_cannot_acknowledge_it(): void
    {
        $b = $this->guestBooks();
        $other = Organization::create([
            'name' => 'Other', 'slug' => 'other', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);
        $stranger = new User();
        $stranger->fill(['name' => 'x', 'email' => 'x@example.com', 'password' => 'password']);
        $stranger->org_id = $other->id;
        $stranger->role = 'operator';
        $stranger->save();

        $this->actingAs($stranger, 'sanctum')->postJson("/api/bookings/{$b->id}/acknowledge")->assertNotFound();
        $this->assertNull($b->fresh()->acknowledged_at);
    }

    public function test_three_asks_for_another_time(): void
    {
        $rules = new RuleUnderstanding();

        $this->assertSame('reschedule', $rules->interpret('3'));
        $this->assertSame('reschedule', $rules->interpret('٣'));
        $this->assertSame('confirm', $rules->interpret('1'));
        $this->assertSame('cancel', $rules->interpret('2'));
    }
}
