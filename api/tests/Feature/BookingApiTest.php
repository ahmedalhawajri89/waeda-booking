<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The operator's booking endpoints: one booking per request, scoped to the
 * operator's organization, under the same rules the public form obeys.
 *
 * They replaced a bulk PUT of the whole list that created a duplicate on every
 * save after the first, never checked opening hours, and looked rows up by id
 * with no regard for which organization owned them.
 */
class BookingApiTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Service $service;
    private Service $longService;
    private Resource $room;
    private Resource $otherRoom;
    private Customer $customer;

    /** A Sunday, well in the future, at 10:00 Riyadh time. */
    private const SLOT = '2030-03-03T10:00:00+03:00';

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create([
            'name' => 'Test Clinic', 'slug' => 'test', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);
        $this->operator = $this->makeOperator($this->org, 'op@example.com');

        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $this->otherRoom = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 2']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Consultation',
            'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
        ]);
        $this->service->resources()->sync([$this->room->id, $this->otherRoom->id]);
        $this->longService = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Long session',
            'duration_min' => 90, 'buffer_min' => 0, 'price_minor' => 40000,
        ]);
        $this->longService->resources()->sync([$this->room->id]);

        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '09:00', 'close_time' => '18:00', 'is_closed' => false,
            ]);
        }

        $this->customer = Customer::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id,
            'name' => 'ريم الدوسري', 'phone' => '0501234567',
        ]);
    }

    private function makeOperator(Organization $org, string $email): User
    {
        $user = new User();
        $user->fill(['name' => $email, 'email' => $email, 'password' => 'password']);
        $user->org_id = $org->id;
        $user->role = 'operator';
        $user->save();

        return $user;
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'id' => (string) Str::uuid(),
            'customerId' => $this->customer->id,
            'serviceId' => $this->service->id,
            'resourceId' => $this->room->id,
            'startAt' => self::SLOT,
            'status' => 'confirmed',
            'paymentStatus' => 'unpaid',
            'channel' => 'phone',
        ], $overrides);
    }

    private function book(array $overrides = [])
    {
        return $this->actingAs($this->operator, 'sanctum')->postJson('/api/bookings', $this->payload($overrides));
    }

    private function edit(string $id, array $data)
    {
        return $this->actingAs($this->operator, 'sanctum')->patchJson("/api/bookings/$id", $data);
    }

    /* ------------------------------------------------------------- create */

    public function test_a_booking_is_stored_under_the_id_the_client_chose(): void
    {
        $id = (string) Str::uuid();

        $this->book(['id' => $id])
            ->assertCreated()
            ->assertJsonPath('id', $id)
            ->assertJsonPath('priceMinor', 15000)
            ->assertJsonStructure(['reference', 'endAt', 'history']);
    }

    public function test_repeating_a_create_returns_the_same_booking_instead_of_a_second_one(): void
    {
        // The bug this endpoint exists to fix: saving again created the
        // booking again.
        $payload = $this->payload();

        $first = $this->actingAs($this->operator, 'sanctum')->postJson('/api/bookings', $payload)->assertCreated();
        $again = $this->actingAs($this->operator, 'sanctum')->postJson('/api/bookings', $payload)->assertOk();

        $this->assertSame($first->json('reference'), $again->json('reference'));
        $this->assertSame(1, Booking::count());
    }

    public function test_an_operator_booking_outside_opening_hours_is_refused(): void
    {
        $this->book(['startAt' => '2030-03-03T17:45:00+03:00'])
            ->assertStatus(422)->assertJsonPath('error', 'outside_business_hours');
    }

    public function test_a_service_must_run_on_the_resource_it_is_booked_on(): void
    {
        $this->book(['serviceId' => $this->longService->id, 'resourceId' => $this->otherRoom->id])
            ->assertStatus(422)->assertJsonPath('error', 'resource_not_offered');
    }

    public function test_an_inactive_resource_takes_no_new_bookings(): void
    {
        $this->otherRoom->update(['is_active' => false]);

        $this->book(['resourceId' => $this->otherRoom->id])
            ->assertStatus(422)->assertJsonPath('error', 'resource_not_offered');
    }

    public function test_an_overlap_is_still_a_conflict(): void
    {
        $this->book()->assertCreated();

        $this->book(['startAt' => '2030-03-03T10:20:00+03:00'])->assertStatus(409);
    }

    /* ------------------------------------------------------------- update */

    public function test_a_status_change_is_one_small_request(): void
    {
        $id = $this->book()->json('id');

        $this->edit($id, ['status' => 'completed', 'paymentStatus' => 'paid'])
            ->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('paymentStatus', 'paid');
    }

    public function test_a_note_can_be_cleared(): void
    {
        $id = $this->book(['notes' => 'طاولة بجانب النافذة'])->json('id');

        $this->edit($id, ['notes' => null])->assertOk()->assertJsonPath('notes', null);
    }

    public function test_moving_a_booking_records_where_it_came_from_and_went(): void
    {
        $id = $this->book()->json('id');

        $response = $this->edit($id, ['startAt' => '2030-03-03T12:00:00+03:00'])->assertOk();

        $summary = collect($response->json('history'))->firstWhere('type', 'rescheduled')['summary'];
        $this->assertStringContainsString('10:00', $summary);
        $this->assertStringContainsString('12:00', $summary);
    }

    public function test_moving_onto_a_taken_slot_is_refused(): void
    {
        $this->book()->assertCreated();
        $id = $this->book(['startAt' => '2030-03-03T11:00:00+03:00'])->json('id');

        $this->edit($id, ['startAt' => '2030-03-03T10:20:00+03:00'])->assertStatus(409);
    }

    public function test_a_booking_can_move_to_another_person_at_the_same_time(): void
    {
        // The calendar's drag between columns: same time, other resource.
        $id = $this->book()->json('id');

        $this->edit($id, ['resourceId' => $this->otherRoom->id])->assertOk();

        $this->assertSame($this->otherRoom->id, Booking::find($id)->resource_id);
    }

    public function test_moving_to_a_person_who_is_busy_then_is_refused(): void
    {
        $this->book(['resourceId' => $this->otherRoom->id])->assertCreated();
        $id = $this->book(['startAt' => '2030-03-03T10:00:00+03:00'])->json('id');

        $this->edit($id, ['resourceId' => $this->otherRoom->id])->assertStatus(409);
        $this->assertSame($this->room->id, Booking::find($id)->resource_id);
    }

    public function test_moving_outside_opening_hours_is_refused(): void
    {
        $id = $this->book()->json('id');

        $this->edit($id, ['startAt' => '2030-03-03T07:00:00+03:00'])
            ->assertStatus(422)->assertJsonPath('error', 'outside_business_hours');
    }

    public function test_changing_the_service_recomputes_the_end_and_the_price(): void
    {
        $id = $this->book()->json('id');

        $response = $this->edit($id, ['serviceId' => $this->longService->id])->assertOk();

        $this->assertSame(40000, $response->json('priceMinor'));
        $this->assertSame(90, (int) Carbon::parse($response->json('startAt'))->diffInMinutes(Carbon::parse($response->json('endAt'))));
    }

    public function test_moving_a_cancelled_booking_keeps_its_end_after_its_start(): void
    {
        // The end used to be recomputed only when the slot needed checking, so
        // a non-blocking booking moved later kept its old end.
        $id = $this->book(['status' => 'cancelled'])->json('id');

        $response = $this->edit($id, ['startAt' => '2030-03-03T15:00:00+03:00'])->assertOk();

        $this->assertTrue(Carbon::parse($response->json('endAt'))->gt(Carbon::parse($response->json('startAt'))));
    }

    /* -------------------------------------------------------- isolation */

    public function test_an_operator_cannot_touch_another_organizations_booking(): void
    {
        $id = $this->book()->json('id');

        $rival = Organization::create(['name' => 'Rival', 'slug' => 'rival', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $outsider = $this->makeOperator($rival, 'rival@example.com');

        $this->actingAs($outsider, 'sanctum')->patchJson("/api/bookings/$id", ['status' => 'cancelled'])
            ->assertNotFound();
        $this->assertSame('confirmed', Booking::find($id)->status);
    }

    public function test_an_operator_cannot_book_another_organizations_service_or_customer(): void
    {
        $rival = Organization::create(['name' => 'Rival', 'slug' => 'rival', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $outsider = $this->makeOperator($rival, 'rival@example.com');

        $this->actingAs($outsider, 'sanctum')->postJson('/api/bookings', $this->payload())->assertNotFound();
    }

    public function test_a_catalog_save_cannot_rewrite_another_organizations_rows(): void
    {
        $rival = Organization::create(['name' => 'Rival', 'slug' => 'rival', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $outsider = $this->makeOperator($rival, 'rival@example.com');

        $this->actingAs($outsider, 'sanctum')->putJson('/api/catalog', [
            'resources' => [['id' => $this->room->id, 'name' => 'Stolen', 'isActive' => false]],
        ])->assertStatus(409);

        $this->assertSame('Room 1', $this->room->fresh()->name);
        $this->assertSame($this->org->id, $this->room->fresh()->org_id);
    }

    /* ------------------------------------------------------------ accounts */

    public function test_registering_links_the_account_to_the_existing_customer_record(): void
    {
        // A customer who booked as a guest, then signs up with the same phone,
        // sees the booking they already made.
        $this->book()->assertCreated();

        $this->postJson('/api/auth/register', [
            'email' => 'reem@example.com', 'password' => 'password',
            'fullName' => 'ريم الدوسري', 'phone' => '050 123 4567',
            'verificationToken' => $this->phoneToken('0501234567'),
        ])->assertCreated();

        $user = User::where('email', 'reem@example.com')->first();
        $this->assertSame($user->id, $this->customer->fresh()->user_id);

        $this->actingAs($user, 'sanctum')->getJson('/api/bookings')->assertOk()->assertJsonCount(1);
    }
}
