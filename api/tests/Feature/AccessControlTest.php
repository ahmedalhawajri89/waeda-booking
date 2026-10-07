<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
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
 * What each caller may see and do.
 *
 * This file replaces supabase/tests/02_rls.sql, and it is the part of the port
 * that deserves the most suspicion. Row Level Security failed closed: a query
 * that forgot to scope itself still returned only permitted rows, so a mistake
 * in a controller could not become a leak. Nothing here works that way — the
 * middleware on a route and the branches in a controller are the whole
 * defence, and both are code that can be wrong.
 *
 * So these tests are not a formality. They are the only thing standing where
 * the database used to stand.
 */
class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private User $customerUser;
    private Customer $ownRecord;
    private Customer $someoneElse;
    private Service $service;
    private Resource $room;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create([
            'name' => 'Test Clinic', 'slug' => 'test', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);

        $this->operator = $this->makeUser('op@example.com', 'operator');
        $this->customerUser = $this->makeUser('cust@example.com', 'customer');

        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Consultation',
            'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
        ]);
        $this->service->resources()->sync([$this->room->id]);

        $this->ownRecord = Customer::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'user_id' => $this->customerUser->id,
            'name' => 'ريم الدوسري', 'phone' => '0501111111',
        ]);
        $this->someoneElse = Customer::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id,
            'name' => 'بدر الشمري', 'phone' => '0502222222',
        ]);

        $writer = app(BookingWriter::class);
        foreach ([[$this->ownRecord, '09:00'], [$this->someoneElse, '11:00']] as [$c, $t]) {
            $writer->create([
                'org_id' => $this->org->id, 'customer_id' => $c->id,
                'service_id' => $this->service->id, 'resource_id' => $this->room->id,
                'start_at' => Carbon::parse("2030-03-03 $t"), 'status' => 'confirmed',
            ]);
        }
    }

    private function makeUser(string $email, string $role): User
    {
        $user = new User();
        $user->fill(['name' => $email, 'email' => $email, 'password' => 'password']);
        $user->org_id = $this->org->id;
        $user->role = $role;
        $user->save();

        return $user;
    }

    /* ------------------------------------------------------------- guests */

    public function test_a_guest_can_read_the_catalog(): void
    {
        // The booking wizard has no session and still has to show services,
        // resources and opening hours.
        $this->getJson('/api/catalog')
            ->assertOk()
            ->assertJsonPath('services.0.name', 'Consultation');
    }

    public function test_a_guest_never_sees_an_inactive_service(): void
    {
        $this->service->update(['is_active' => false]);

        $this->getJson('/api/catalog')->assertOk()->assertJsonCount(0, 'services');
    }

    public function test_a_guest_sees_no_customers(): void
    {
        // The single most important assertion in this file. Every customer's
        // name and phone number is behind it.
        $this->getJson('/api/customers')->assertOk()->assertJsonCount(0);
    }

    public function test_a_guest_sees_no_bookings(): void
    {
        $this->getJson('/api/bookings')->assertOk()->assertJsonCount(0);
    }

    public function test_a_guest_cannot_write_anything(): void
    {
        $this->postJson('/api/bookings', [])->assertUnauthorized();
        $this->patchJson('/api/bookings/'.Booking::first()->id, ['status' => 'cancelled'])->assertUnauthorized();
        $this->putJson('/api/customers', ['customers' => []])->assertUnauthorized();
        $this->putJson('/api/catalog', [])->assertUnauthorized();
    }

    /* ---------------------------------------------------------- customers */

    public function test_a_signed_in_customer_sees_only_their_own_bookings(): void
    {
        $response = $this->actingAs($this->customerUser, 'sanctum')->getJson('/api/bookings');

        $response->assertOk()->assertJsonCount(1);
        $this->assertSame($this->ownRecord->id, $response->json('0.customerId'));
    }

    public function test_a_signed_in_customer_sees_only_their_own_record(): void
    {
        $response = $this->actingAs($this->customerUser, 'sanctum')->getJson('/api/customers');

        $response->assertOk()->assertJsonCount(1);
        $this->assertSame('ريم الدوسري', $response->json('0.name'));
    }

    public function test_a_customer_cannot_reach_the_operator_writes(): void
    {
        // A signed-in customer is authenticated, so the difference between 401
        // and 403 here is the difference between "log in" and "no".
        $this->actingAs($this->customerUser, 'sanctum')
            ->postJson('/api/bookings', [])
            ->assertForbidden();

        $this->actingAs($this->customerUser, 'sanctum')
            ->patchJson('/api/bookings/'.Booking::first()->id, ['status' => 'cancelled'])
            ->assertForbidden();

        $this->actingAs($this->customerUser, 'sanctum')
            ->putJson('/api/catalog', [])
            ->assertForbidden();
    }

    /* ---------------------------------------------------------- operators */

    public function test_an_operator_sees_the_whole_organization(): void
    {
        $this->actingAs($this->operator, 'sanctum')->getJson('/api/bookings')
            ->assertOk()->assertJsonCount(2);

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/customers')
            ->assertOk()->assertJsonCount(2);
    }

    public function test_an_operator_sees_inactive_services_because_settings_needs_them(): void
    {
        $this->service->update(['is_active' => false]);

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/catalog')
            ->assertOk()->assertJsonCount(1, 'services');
    }

    /* ------------------------------------------------------ role escalation */

    public function test_registering_cannot_grant_operator_access(): void
    {
        // The attempt that matters: `role` in the request body. It is not in
        // $fillable, so it has nowhere to land — but the assertion is what
        // stops someone adding it there later without noticing.
        $this->postJson('/api/auth/register', [
            'email' => 'sneaky@example.com',
            'password' => 'password',
            'fullName' => 'Sneaky Person',
            'role' => 'operator',
        ])->assertCreated();

        $this->assertSame('customer', User::where('email', 'sneaky@example.com')->value('role'));
    }

    public function test_a_token_is_required_and_honoured(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'op@example.com', 'password' => 'password',
        ])->assertOk()->assertJsonPath('user.role', 'operator')->assertJsonStructure(['token']);

        $this->postJson('/api/auth/login', [
            'email' => 'op@example.com', 'password' => 'wrong',
        ])->assertStatus(422);
    }

    public function test_the_login_error_does_not_reveal_whether_an_account_exists(): void
    {
        $unknown = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com', 'password' => 'password',
        ]);
        $wrongPassword = $this->postJson('/api/auth/login', [
            'email' => 'op@example.com', 'password' => 'wrong',
        ]);

        $this->assertSame($unknown->status(), $wrongPassword->status());
        $this->assertSame(
            $unknown->json('message'),
            $wrongPassword->json('message'),
            'A different message for an unknown address turns the login form into an account oracle.'
        );
    }

    /* ------------------------------------------------------- audit trail */

    public function test_the_history_is_written_by_the_server_not_the_caller(): void
    {
        $booking = Booking::first();

        $this->actingAs($this->operator, 'sanctum')->patchJson('/api/bookings/'.$booking->id, [
            'status' => 'completed',
            'paymentStatus' => 'paid',
            // A forged history. It must not survive: the events the client
            // sends are ignored and the real ones are derived from the diff.
            'history' => [['at' => now()->toIso8601String(), 'type' => 'created', 'summary' => 'قصة مختلقة']],
        ])->assertOk();

        $summaries = $booking->fresh()->events->pluck('summary')->all();

        $this->assertNotContains('قصة مختلقة', $summaries);
        $this->assertContains('اكتملت الخدمة', $summaries);
        $this->assertContains('سُجّل الدفع كاملاً', $summaries);
    }
}
