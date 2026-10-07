<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\BusinessHour;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Opening a business, and keeping businesses apart.
 *
 * Sign-up used to create a customer of the one business there was. Now it
 * opens a business of its own, with a booking page at /b/{slug}, and every
 * guest path has to land on the business the guest is looking at — never on
 * whichever happens to be first.
 */
class RegisterBusinessTest extends TestCase
{
    use RefreshDatabase;

    private Organization $first;

    protected function setUp(): void
    {
        parent::setUp();

        // An existing business, so "the first one" is never the new one.
        $this->first = Organization::create([
            'name' => 'Existing', 'slug' => 'existing', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_replace_recursive([
            'fullName' => 'هيا الشمري',
            'email' => 'haya@example.com',
            'password' => 'secret-pass',
            'business' => [
                'name' => 'صالون لمسة', 'slug' => 'lamsa',
                'category' => 'الصالونات ومراكز التجميل', 'address' => 'حي النرجس، الرياض',
            ],
            'staff' => [['name' => 'أ. ريم', 'role' => 'مصففة شعر'], ['name' => 'أ. هيا']],
            'services' => [
                ['name' => 'قص وتصفيف', 'category' => 'الشعر', 'durationMin' => 45, 'priceMinor' => 12000],
                ['name' => 'تنظيف بشرة', 'category' => 'البشرة', 'durationMin' => 60, 'priceMinor' => 22000],
            ],
            'hours' => collect(range(0, 6))->map(fn ($d) => [
                'weekday' => $d, 'open' => '10:00', 'close' => '22:00', 'isClosed' => $d === 5,
            ])->all(),
        ], $overrides);
    }

    public function test_signing_up_opens_a_business_with_its_owner_signed_in(): void
    {
        $res = $this->postJson('/api/auth/register-business', $this->payload())
            ->assertCreated()
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.role', 'operator')
            ->assertJsonPath('user.orgSlug', 'lamsa');

        $org = Organization::where('slug', 'lamsa')->firstOrFail();
        $this->assertSame('صالون لمسة', $org->name);
        $this->assertSame($org->id, User::where('email', 'haya@example.com')->value('org_id'));
        $this->assertSame(2, Resource::where('org_id', $org->id)->count());
        $this->assertSame(2, Service::where('org_id', $org->id)->count());
        $this->assertSame(7, BusinessHour::where('org_id', $org->id)->count());
        $this->assertSame('مصففة شعر', Resource::where('org_id', $org->id)->where('name', 'أ. ريم')->value('role'));

        // Every service can be done by everyone, to begin with.
        $service = Service::where('org_id', $org->id)->first();
        $this->assertSame(2, $service->resources()->count());

        // The token works on the console straight away.
        $this->withToken($res->json('token'))->getJson('/api/catalog')
            ->assertOk()->assertJsonPath('business.slug', 'lamsa');
    }

    public function test_a_link_can_only_be_taken_once(): void
    {
        $this->postJson('/api/auth/register-business', $this->payload())->assertCreated();

        $this->postJson('/api/auth/register-business', $this->payload(['email' => 'other@example.com']))
            ->assertStatus(422)->assertJsonValidationErrors('business.slug');
    }

    public function test_reserved_and_malformed_links_are_refused(): void
    {
        foreach (['admin', 'book', 'Lamsa Salon', 'a', '-lamsa'] as $slug) {
            $this->postJson('/api/auth/register-business', $this->payload([
                'email' => Str::random(6).'@example.com', 'business' => ['slug' => $slug],
            ]))->assertStatus(422);
        }
        $this->assertSame(0, Organization::where('slug', '!=', 'existing')->count());
    }

    public function test_link_availability_can_be_checked_while_typing(): void
    {
        $this->getJson('/api/auth/slug-available?slug=lamsa')->assertJsonPath('available', true);
        $this->getJson('/api/auth/slug-available?slug=existing')->assertJsonPath('available', false);
        $this->getJson('/api/auth/slug-available?slug=admin')->assertJsonPath('available', false);
        $this->getJson('/api/auth/slug-available?slug=Not Valid')->assertJsonPath('available', false);
    }

    public function test_a_guest_page_reads_the_business_it_names(): void
    {
        $this->postJson('/api/auth/register-business', $this->payload())->assertCreated();

        $this->withHeader('X-Org', 'lamsa')->getJson('/api/catalog')
            ->assertOk()
            ->assertJsonPath('business.name', 'صالون لمسة')
            ->assertJsonCount(2, 'services')
            ->assertJsonPath('services.0.category', 'الشعر');

        $this->withHeader('X-Org', 'nobody-here')->getJson('/api/catalog')->assertNotFound();
    }

    public function test_a_guest_booking_lands_on_the_business_it_names(): void
    {
        $this->postJson('/api/auth/register-business', $this->payload())->assertCreated();
        $org = Organization::where('slug', 'lamsa')->firstOrFail();
        $service = Service::where('org_id', $org->id)->where('name', 'قص وتصفيف')->firstOrFail();
        $staff = Resource::where('org_id', $org->id)->firstOrFail();
        $start = Carbon::now('Asia/Riyadh')->next(Carbon::SUNDAY)->setTime(11, 0);

        $reference = $this->withHeader('X-Org', 'lamsa')->postJson('/api/public/bookings', [
            'serviceId' => $service->id, 'resourceId' => $staff->id,
            'startAt' => $start->toIso8601String(), 'name' => 'نوف', 'phone' => '0551234567',
        ])->assertCreated()->json('reference');

        $this->assertSame($org->id, Booking::where('reference', $reference)->value('org_id'));

        // Looked up on its own business it is found; named as another, it is not.
        $this->withHeader('X-Org', 'lamsa')
            ->getJson("/api/public/bookings/{$reference}?phone=0551234567")->assertOk();
        $this->withHeader('X-Org', 'existing')
            ->getJson("/api/public/bookings/{$reference}?phone=0551234567")->assertNotFound();
    }

    public function test_a_header_cannot_point_an_operator_write_at_another_business(): void
    {
        $token = $this->postJson('/api/auth/register-business', $this->payload())->json('token');

        $this->withToken($token)->withHeader('X-Org', 'existing')->putJson('/api/catalog', [
            'resources' => [['id' => (string) Str::uuid(), 'name' => 'دخيل', 'isActive' => true]],
        ])->assertNoContent();

        $this->assertSame(0, Resource::where('org_id', $this->first->id)->count());
    }
}
