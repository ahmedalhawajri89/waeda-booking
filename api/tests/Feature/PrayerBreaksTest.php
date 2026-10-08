<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use App\Services\Hours;
use App\Services\PrayerBreaks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Prayer pauses — src/lib/__tests__/prayer.spec.js on the server side, plus
 * the rule that the page hides a pause and the server refuses only what is
 * clearly inside one.
 */
class PrayerBreaksTest extends TestCase
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
            'name' => 'Salon', 'slug' => 'salon', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);
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
                'open_time' => '09:00', 'close_time' => '22:00', 'is_closed' => false,
            ]);
        }
    }

    private function enable(array $over = []): void
    {
        DB::table('organizations')->where('id', $this->org->id)->update(['prayer_breaks' => json_encode($over + [
            'enabled' => true, 'city' => 'riyadh', 'prayers' => ['dhuhr', 'asr', 'maghrib', 'isha'],
            'minutes' => 20, 'jumuahMinutes' => 45,
        ])]);
    }

    private function at(string $date, string $time): Carbon
    {
        return Carbon::parse("$date $time", 'Asia/Riyadh');
    }

    public function test_umm_al_qura_times_for_riyadh_match_the_client(): void
    {
        $t = app(PrayerBreaks::class)->timesOn($this->at('2026-10-08', '00:00'), 'riyadh', 'Asia/Riyadh');

        // The client (adhan) says 11:41, 17:33, 19:03; allow the libraries a few minutes.
        $this->assertLessThanOrEqual(3, abs($t['dhuhr']->diffInMinutes($this->at('2026-10-08', '11:41'))));
        $this->assertLessThanOrEqual(3, abs($t['maghrib']->diffInMinutes($this->at('2026-10-08', '17:33'))));
        $this->assertSame(90, (int) $t['maghrib']->diffInMinutes($t['isha']));
    }

    public function test_isha_is_two_hours_after_maghrib_in_ramadan(): void
    {
        $t = app(PrayerBreaks::class)->timesOn($this->at('2027-02-20', '00:00'), 'riyadh', 'Asia/Riyadh');

        $this->assertSame(120, (int) $t['maghrib']->diffInMinutes($t['isha']));
    }

    public function test_pauses_are_off_until_turned_on(): void
    {
        $w = app(Hours::class)->windowFor($this->org->id, $this->at('2026-10-08', '00:00'));

        $this->assertSame([], $w['breaks']);
    }

    public function test_a_friday_pause_is_jumuah_and_longer(): void
    {
        $this->enable(['prayers' => ['dhuhr']]);
        $w = app(Hours::class)->windowFor($this->org->id, $this->at('2026-10-09', '00:00'));

        $this->assertSame('صلاة الجمعة', $w['breaks'][0]['label']);
        $this->assertGreaterThanOrEqual(45, (int) $w['breaks'][0]['start']->diffInMinutes($w['breaks'][0]['end']));
    }

    private function guestBooks(Carbon $start)
    {
        return $this->postJson('/api/public/bookings', [
            'serviceId' => $this->service->id,
            'resourceId' => $this->room->id,
            'startAt' => $start->toIso8601String(),
            'name' => 'نورة',
            'phone' => '0501234567',
        ]);
    }

    /** Next week's Thursday, so it is never in the past; its dhuhr pause. */
    private function nextDhuhr(): array
    {
        $day = Carbon::now('Asia/Riyadh')->next(Carbon::THURSDAY)->addWeek()->startOfDay();
        $w = app(Hours::class)->windowFor($this->org->id, $day);

        return [$day, $w['breaks'][0]];
    }

    public function test_the_booking_page_cannot_book_into_prayer(): void
    {
        $this->enable(['prayers' => ['dhuhr']]);
        [, $pause] = $this->nextDhuhr();

        $this->guestBooks($pause['start']->copy()->addMinutes(5))->assertStatus(422);
    }

    public function test_the_edges_of_a_pause_are_not_refused(): void
    {
        $this->enable(['prayers' => ['dhuhr']]);
        [, $pause] = $this->nextDhuhr();

        // Ends five minutes into the pause: inside the libraries' disagreement, so allowed.
        $this->guestBooks($pause['start']->copy()->subMinutes(25))->assertCreated();
    }

    public function test_the_desk_can_still_book_a_customer_who_is_standing_there(): void
    {
        $this->enable(['prayers' => ['dhuhr']]);
        [, $pause] = $this->nextDhuhr();
        $customer = Customer::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'x', 'phone' => '0509999999',
        ]);

        $this->actingAs($this->operator, 'sanctum')->postJson('/api/bookings', [
            'customerId' => $customer->id,
            'serviceId' => $this->service->id,
            'resourceId' => $this->room->id,
            'startAt' => $pause['start']->copy()->addMinutes(5)->toIso8601String(),
        ])->assertCreated();
    }

    public function test_settings_save_the_pauses_and_refuse_an_unknown_city(): void
    {
        $cfg = ['enabled' => true, 'city' => 'jeddah', 'prayers' => ['dhuhr', 'asr'], 'minutes' => 15, 'jumuahMinutes' => 40];

        $this->actingAs($this->operator, 'sanctum')->putJson('/api/catalog', ['prayer' => $cfg])->assertNoContent();
        $this->actingAs($this->operator, 'sanctum')->getJson('/api/catalog')
            ->assertJsonPath('prayer.city', 'jeddah')
            ->assertJsonPath('prayer.minutes', 15);

        $this->actingAs($this->operator, 'sanctum')
            ->putJson('/api/catalog', ['prayer' => ['city' => 'atlantis'] + $cfg])
            ->assertStatus(422);
    }
}
