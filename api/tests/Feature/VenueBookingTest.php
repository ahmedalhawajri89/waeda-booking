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
 * A padel club: a court (a place, not a person) booked for 60, 90 or 120
 * minutes, dearer from five o'clock, often every week.
 */
class VenueBookingTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Service $padel;
    private Resource $court;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Padel', 'slug' => 'padel', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->operator = new User();
        $this->operator->fill(['name' => 'op', 'email' => 'op@example.com', 'password' => 'password']);
        $this->operator->org_id = $this->org->id;
        $this->operator->role = 'operator';
        $this->operator->save();

        $this->court = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'ملعب 1', 'kind' => 'place']);
        $this->padel = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Padel',
            'duration_min' => 60, 'duration_options' => [60, 90, 120], 'buffer_min' => 0,
            'price_minor' => 15000, 'peak_from' => '17:00', 'peak_price_minor' => 20000,
        ]);
        $this->padel->resources()->sync([$this->court->id]);
        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '16:00', 'close_time' => '02:00', 'is_closed' => false,
            ]);
        }
    }

    /** A day well ahead, at a wall-clock time in Riyadh (+1 day for after midnight). */
    private function at(string $time, int $plusDays = 0): Carbon
    {
        return Carbon::now('Asia/Riyadh')->addWeek()->startOfDay()->addDays($plusDays)->setTimeFromTimeString($time);
    }

    private function guest(Carbon $start, ?int $duration = null, array $extra = [])
    {
        return $this->postJson('/api/public/bookings', array_filter([
            'serviceId' => $this->padel->id, 'resourceId' => $this->court->id,
            'startAt' => $start->toIso8601String(), 'name' => 'سعد', 'phone' => '0501234567',
            'durationMin' => $duration, 'verificationToken' => $this->phoneToken('0501234567'),
        ] + $extra, fn ($v) => $v !== null));
    }

    public function test_a_longer_game_takes_longer_and_costs_in_proportion(): void
    {
        $r = $this->guest($this->at('16:00'), 90)->assertCreated();

        $b = Booking::findOrFail($r->json('id'));
        $this->assertSame(90, $b->duration_min);
        $this->assertTrue($b->end_at->equalTo($this->at('17:30')));
        $this->assertSame(22500, $b->price_minor);
        $this->assertSame(22500, $r->json('priceMinor'));
    }

    public function test_from_five_o_clock_the_peak_price_applies(): void
    {
        $this->assertSame(20000, $this->guest($this->at('18:00'))->assertCreated()->json('priceMinor'));
    }

    public function test_after_midnight_is_still_the_evening_peak(): void
    {
        $this->assertSame(20000, $this->guest($this->at('01:00', 1))->assertCreated()->json('priceMinor'));
    }

    public function test_a_length_the_service_does_not_offer_is_refused(): void
    {
        $this->guest($this->at('16:00'), 45)->assertStatus(422);
    }

    public function test_the_price_a_client_sends_is_ignored(): void
    {
        $this->assertSame(15000, $this->guest($this->at('16:00'), null, ['priceMinor' => 1])->assertCreated()->json('priceMinor'));
    }

    public function test_a_long_game_cannot_run_past_closing(): void
    {
        $this->guest($this->at('01:00', 1), 120)->assertStatus(422);
    }

    private function deskBooking(array $over = [])
    {
        $customer = Customer::firstOrCreate(
            ['org_id' => $this->org->id, 'phone' => '0509999999'],
            ['id' => (string) Str::uuid(), 'name' => 'فريق الثلاثاء'],
        );

        return $this->actingAs($this->operator, 'sanctum')->postJson('/api/bookings', $over + [
            'customerId' => $customer->id, 'serviceId' => $this->padel->id, 'resourceId' => $this->court->id,
            'startAt' => $this->at('16:00')->toIso8601String(), 'status' => 'confirmed', 'channel' => 'phone',
        ]);
    }

    public function test_moving_an_unpaid_game_into_the_peak_reprices_it_but_a_paid_one_keeps_its_price(): void
    {
        $id = $this->deskBooking()->assertCreated()->json('id');
        $this->actingAs($this->operator, 'sanctum')
            ->patchJson("/api/bookings/$id", ['startAt' => $this->at('19:00')->toIso8601String()])
            ->assertOk()->assertJsonPath('priceMinor', 20000);

        $paid = $this->deskBooking(['startAt' => $this->at('20:30')->toIso8601String(), 'paymentStatus' => 'paid'])->json('id');
        $this->actingAs($this->operator, 'sanctum')
            ->patchJson("/api/bookings/$paid", ['startAt' => $this->at('16:30')->toIso8601String()])
            ->assertOk()->assertJsonPath('priceMinor', 20000);
    }

    public function test_a_moved_booking_keeps_its_length(): void
    {
        $id = $this->deskBooking(['durationMin' => 120])->assertCreated()->json('id');
        $this->actingAs($this->operator, 'sanctum')
            ->patchJson("/api/bookings/$id", ['startAt' => $this->at('20:00')->toIso8601String()])
            ->assertOk()->assertJsonPath('durationMin', 120);

        $this->assertTrue(Booking::find($id)->end_at->equalTo($this->at('22:00')));
    }

    public function test_a_weekly_booking_shares_one_series(): void
    {
        $series = (string) Str::uuid();
        $this->deskBooking(['seriesId' => $series])->assertCreated();
        $this->deskBooking(['seriesId' => $series, 'startAt' => $this->at('16:00', 7)->toIso8601String()])->assertCreated();

        $this->assertSame(2, Booking::where('series_id', $series)->count());
        $this->actingAs($this->operator, 'sanctum')->getJson('/api/bookings')->assertJsonPath('0.seriesId', $series);
    }

    public function test_settings_keep_the_lengths_and_the_peak(): void
    {
        $this->actingAs($this->operator, 'sanctum')->putJson('/api/catalog', ['services' => [[
            'id' => $this->padel->id, 'name' => 'Padel', 'durationMin' => 60, 'bufferMin' => 0, 'priceMinor' => 15000,
            'durationOptions' => [90, 120], 'peakFrom' => '18:00', 'peakPriceMinor' => 25000,
            'resourceIds' => [$this->court->id], 'iconKey' => 'Sparkles', 'isActive' => true,
        ]]])->assertNoContent();

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/catalog')
            ->assertJsonPath('services.0.durationOptions', [90, 120, 60])
            ->assertJsonPath('services.0.peakFrom', '18:00')
            ->assertJsonPath('services.0.peakPriceMinor', 25000)
            ->assertJsonPath('resources.0.kind', 'place');
    }

    public function test_a_club_signs_up_with_courts_lengths_and_a_peak(): void
    {
        $this->postJson('/api/auth/register-business', [
            'fullName' => 'سعد', 'email' => 'club@example.com', 'password' => 'password123',
            'business' => ['name' => 'نادي الأوج', 'slug' => 'alawj', 'category' => 'ملاعب ونادي رياضي'],
            'staff' => [['name' => 'ملعب 1', 'kind' => 'place'], ['name' => 'ملعب 2', 'kind' => 'place']],
            'services' => [[
                'name' => 'بادل', 'durationMin' => 60, 'priceMinor' => 15000, 'iconKey' => 'Trophy',
                'durationOptions' => [60, 90, 120], 'peakFrom' => '17:00', 'peakPriceMinor' => 20000,
            ]],
            'hours' => array_map(fn ($d) => ['weekday' => $d, 'open' => '16:00', 'close' => '02:00', 'isClosed' => false], range(0, 6)),
        ])->assertCreated();

        $org = Organization::where('slug', 'alawj')->firstOrFail();
        $this->assertSame(['place', 'place'], Resource::where('org_id', $org->id)->orderBy('sort_order')->pluck('kind')->all());
        $service = Service::where('org_id', $org->id)->firstOrFail();
        $this->assertSame([60, 90, 120], $service->durations());
        $this->assertSame(20000, $service->peak_price_minor);
        // Courts are handed straight over: no turnaround.
        $this->assertSame(0, $service->buffer_min);
    }
}
