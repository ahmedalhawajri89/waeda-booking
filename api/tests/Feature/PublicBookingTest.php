<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BusinessHour;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Booking without an account.
 *
 * These endpoints replace the security-definer functions in
 * supabase/migrations/0006, and they inherit the reason those existed: the
 * guest path has to write across tables an anonymous caller must not touch.
 * The tests below are mostly about what the caller does *not* get to decide.
 */
class PublicBookingTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private Service $service;
    private Resource $room;
    private Resource $unofferedRoom;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create([
            'name' => 'Test Clinic', 'slug' => 'test', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);
        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $this->unofferedRoom = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 2']);

        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Consultation',
            'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
        ]);
        $this->service->resources()->sync([$this->room->id]);

        // Open 09:00–18:00 every day, so only the deliberately-out-of-hours
        // cases below are out of hours.
        for ($weekday = 0; $weekday <= 6; $weekday++) {
            BusinessHour::create([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '09:00', 'close_time' => '18:00', 'is_closed' => false,
            ]);
        }
    }

    /** A time that is definitely in the future and inside opening hours, in the org's zone. */
    private function futureSlot(string $time = '10:00'): Carbon
    {
        return Carbon::now('Asia/Riyadh')->addWeek()->startOfDay()->setTimeFromTimeString($time);
    }

    private function payload(array $overrides = []): array
    {
        $payload = array_merge([
            'serviceId' => $this->service->id,
            'resourceId' => $this->room->id,
            'startAt' => $this->futureSlot()->toIso8601String(),
            'name' => 'ريم الدوسري',
            'phone' => '050 123 4567',
        ], $overrides);
        $payload['verificationToken'] ??= $this->phoneToken($payload['phone']);

        return $payload;
    }

    public function test_a_guest_can_book_and_gets_a_reference(): void
    {
        $this->postJson('/api/public/bookings', $this->payload())
            ->assertCreated()
            ->assertJsonStructure(['id', 'reference']);

        $this->assertSame(1, Booking::count());
    }

    public function test_price_and_end_time_come_from_the_service_not_the_request(): void
    {
        // The whole reason this is an endpoint rather than an INSERT policy.
        $this->postJson('/api/public/bookings', $this->payload([
            'priceMinor' => 1,
            'endAt' => $this->futureSlot('10:05')->toIso8601String(),
            'status' => 'completed',
        ]))->assertCreated();

        $booking = Booking::first();
        $this->assertSame(15000, $booking->price_minor);
        $this->assertEqualsWithDelta(40, $booking->start_at->diffInMinutes($booking->end_at), 0.001);
        $this->assertSame('pending', $booking->status);
    }

    public function test_a_resource_the_service_is_not_offered_on_is_refused(): void
    {
        $this->postJson('/api/public/bookings', $this->payload(['resourceId' => $this->unofferedRoom->id]))
            ->assertStatus(422)
            ->assertJsonPath('error', 'resource_not_offered');
    }

    public function test_a_time_in_the_past_is_refused(): void
    {
        $this->postJson('/api/public/bookings', $this->payload([
            'startAt' => Carbon::now()->subDay()->toIso8601String(),
        ]))->assertStatus(422)->assertJsonPath('error', 'start_in_past');
    }

    public function test_a_time_outside_opening_hours_is_refused(): void
    {
        // 22:00 local, when the business closed at 18:00. The client's slot
        // grid never offers this; the server refuses it anyway, because the
        // grid is a convenience and not a control.
        $this->postJson('/api/public/bookings', $this->payload([
            'startAt' => $this->futureSlot('22:00')->toIso8601String(),
        ]))->assertStatus(422)->assertJsonPath('error', 'outside_business_hours');
    }

    public function test_a_booking_that_would_run_past_closing_is_refused(): void
    {
        // Starts inside hours at 17:40 and ends at 18:20, after closing.
        $this->postJson('/api/public/bookings', $this->payload([
            'startAt' => $this->futureSlot('17:40')->toIso8601String(),
        ]))->assertStatus(422)->assertJsonPath('error', 'outside_business_hours');
    }

    public function test_an_inactive_service_cannot_be_booked(): void
    {
        $this->service->update(['is_active' => false]);

        $this->postJson('/api/public/bookings', $this->payload())
            ->assertStatus(422)->assertJsonPath('error', 'unknown_service');
    }

    public function test_a_taken_slot_is_refused_with_a_conflict(): void
    {
        $this->postJson('/api/public/bookings', $this->payload())->assertCreated();

        $this->postJson('/api/public/bookings', $this->payload([
            'startAt' => $this->futureSlot('10:20')->toIso8601String(),
            'phone' => '0509999999',
        ]))->assertStatus(409)->assertJsonPath('error', 'conflict');
    }

    public function test_the_same_phone_in_any_format_is_one_customer(): void
    {
        $this->postJson('/api/public/bookings', $this->payload())->assertCreated();
        $this->postJson('/api/public/bookings', $this->payload([
            'startAt' => $this->futureSlot('12:00')->toIso8601String(),
            'phone' => '050-123-4567',
        ]))->assertCreated();

        // The generated column and its unique index, doing the job
        // normalisePhone() does on the client.
        $this->assertSame(1, Customer::count());
        $this->assertSame(2, Booking::count());
    }

    public function test_a_short_phone_number_is_refused(): void
    {
        $this->postJson('/api/public/bookings', $this->payload(['phone' => '0501']))
            ->assertStatus(422)->assertJsonPath('error', 'invalid_phone');
    }

    /* ------------------------------------------------------- availability */

    public function test_availability_returns_busy_intervals_for_the_resource(): void
    {
        $this->postJson('/api/public/bookings', $this->payload())->assertCreated();
        $day = $this->futureSlot()->toDateString();

        $response = $this->getJson("/api/public/availability?resourceId={$this->room->id}&from={$day}&to={$day}");

        $response->assertOk()->assertJsonCount(1);
        $this->assertNotEmpty($response->json('0.startAt'));
        $this->assertNotEmpty($response->json('0.endAt'));
    }

    public function test_availability_reveals_nothing_but_the_times(): void
    {
        // The whole reason this endpoint exists instead of relaxing /bookings.
        // If it ever starts carrying a name, an id or a status, the wizard
        // stops being anonymous and nobody notices until it is in a bundle.
        $this->postJson('/api/public/bookings', $this->payload(['name' => 'ريم الدوسري']))->assertCreated();
        $day = $this->futureSlot()->toDateString();

        $response = $this->getJson("/api/public/availability?resourceId={$this->room->id}&from={$day}&to={$day}");

        $this->assertSame(['startAt', 'endAt'], array_keys($response->json('0')));
        $this->assertStringNotContainsString('ريم', $response->getContent());
        $this->assertStringNotContainsString('BK-', $response->getContent());
    }

    public function test_availability_ignores_a_released_booking(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');
        $day = $this->futureSlot()->toDateString();

        $this->postJson("/api/public/bookings/{$reference}/cancel", ['phone' => '0501234567'])->assertOk();

        // Cancelled releases its time, matching BLOCKING on the client.
        $this->getJson("/api/public/availability?resourceId={$this->room->id}&from={$day}&to={$day}")
            ->assertOk()->assertJsonCount(0);
    }

    public function test_availability_is_scoped_to_one_resource(): void
    {
        $this->postJson('/api/public/bookings', $this->payload())->assertCreated();
        $day = $this->futureSlot()->toDateString();

        $this->getJson("/api/public/availability?resourceId={$this->unofferedRoom->id}&from={$day}&to={$day}")
            ->assertOk()->assertJsonCount(0);
    }

    public function test_availability_is_scoped_to_the_date_range(): void
    {
        $this->postJson('/api/public/bookings', $this->payload())->assertCreated();
        $otherDay = $this->futureSlot()->addDays(3)->toDateString();

        $this->getJson("/api/public/availability?resourceId={$this->room->id}&from={$otherDay}&to={$otherDay}")
            ->assertOk()->assertJsonCount(0);
    }

    public function test_availability_needs_a_resource_and_a_range(): void
    {
        $this->getJson('/api/public/availability')->assertStatus(422);
    }

    /* ------------------------------------------------------------- lookup */

    public function test_a_booking_can_be_looked_up_with_the_reference_and_phone(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');

        $this->getJson("/api/public/bookings/{$reference}?phone=0501234567")
            ->assertOk()
            ->assertJsonPath('customerName', 'ريم الدوسري')
            ->assertJsonPath('serviceName', 'Consultation');
    }

    public function test_the_reference_alone_is_not_enough(): void
    {
        // BK-2026-0431 is sequential and trivially guessable. One factor would
        // expose every booking to anyone who can count.
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');

        $this->getJson("/api/public/bookings/{$reference}?phone=0000000000")->assertNotFound();
        $this->getJson("/api/public/bookings/{$reference}")->assertStatus(422);
    }

    public function test_a_guest_can_cancel_their_own_booking(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');

        $this->postJson("/api/public/bookings/{$reference}/cancel", ['phone' => '0501234567'])
            ->assertOk()->assertJsonPath('cancelled', true);

        $this->assertSame('cancelled', Booking::first()->status);
    }

    public function test_cancelling_with_the_wrong_phone_does_nothing(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');

        $this->postJson("/api/public/bookings/{$reference}/cancel", ['phone' => '0000000000'])
            ->assertNotFound();

        $this->assertSame('pending', Booking::first()->status);
    }

    public function test_cancelling_frees_the_slot(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');
        $this->postJson("/api/public/bookings/{$reference}/cancel", ['phone' => '0501234567'])->assertOk();

        // The released time is bookable again, immediately.
        $this->postJson('/api/public/bookings', $this->payload(['phone' => '0509999999']))
            ->assertCreated();
    }

    /* --------------------------------------------------------- reschedule */

    public function test_a_guest_can_move_their_own_booking(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');
        $to = $this->futureSlot('14:00');

        $this->postJson("/api/public/bookings/{$reference}/reschedule", [
            'phone' => '0501234567', 'startAt' => $to->toIso8601String(),
        ])->assertOk();

        $booking = Booking::first();
        $this->assertTrue($booking->start_at->equalTo($to));
        // The end follows the service (30 + 10 buffer), not the old end.
        $this->assertEqualsWithDelta(40, $booking->start_at->diffInMinutes($booking->end_at), 0.001);
    }

    public function test_the_lookup_carries_what_the_manage_page_needs(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');

        $this->getJson("/api/public/bookings/{$reference}?phone=0501234567")
            ->assertOk()
            ->assertJsonPath('serviceId', $this->service->id)
            ->assertJsonPath('resourceId', $this->room->id)
            ->assertJsonPath('resourceName', 'Room 1');
    }

    public function test_moving_with_the_wrong_phone_does_nothing(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');

        $this->postJson("/api/public/bookings/{$reference}/reschedule", [
            'phone' => '0000000000', 'startAt' => $this->futureSlot('14:00')->toIso8601String(),
        ])->assertNotFound();

        $this->assertTrue(Booking::first()->start_at->equalTo($this->futureSlot()));
    }

    public function test_moving_onto_a_taken_time_is_a_conflict(): void
    {
        $this->postJson('/api/public/bookings', $this->payload([
            'startAt' => $this->futureSlot('14:00')->toIso8601String(), 'phone' => '0509999999',
        ]))->assertCreated();
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');

        $this->postJson("/api/public/bookings/{$reference}/reschedule", [
            'phone' => '0501234567', 'startAt' => $this->futureSlot('14:00')->toIso8601String(),
        ])->assertStatus(409);
    }

    public function test_moving_outside_opening_hours_is_refused(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');

        $this->postJson("/api/public/bookings/{$reference}/reschedule", [
            'phone' => '0501234567', 'startAt' => $this->futureSlot('20:00')->toIso8601String(),
        ])->assertStatus(422);
    }

    public function test_a_booking_inside_the_cutoff_cannot_be_moved_or_cancelled(): void
    {
        $reference = $this->postJson('/api/public/bookings', $this->payload())->json('reference');
        // An hour before it starts: too late for the guest to change it alone.
        Carbon::setTestNow(Booking::first()->start_at->copy()->subHour());

        $this->postJson("/api/public/bookings/{$reference}/reschedule", [
            'phone' => '0501234567', 'startAt' => $this->futureSlot('14:00')->toIso8601String(),
        ])->assertNotFound();
        $this->postJson("/api/public/bookings/{$reference}/cancel", ['phone' => '0501234567'])
            ->assertNotFound();

        Carbon::setTestNow();
    }
}
