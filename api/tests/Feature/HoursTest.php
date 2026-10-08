<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use App\Services\Hours;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Late nights and special periods — src/lib/__tests__/hours.spec.js, case
 * for case, plus the paths that store and enforce them.
 */
class HoursTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Service $service;
    private Resource $court;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create([
            'name' => 'Padel', 'slug' => 'padel', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);
        $this->operator = new User();
        $this->operator->fill(['name' => 'op', 'email' => 'op@example.com', 'password' => 'password']);
        $this->operator->org_id = $this->org->id;
        $this->operator->role = 'operator';
        $this->operator->save();

        $this->court = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Court 1']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Match',
            'duration_min' => 60, 'buffer_min' => 0, 'price_minor' => 20000,
        ]);
        $this->service->resources()->sync([$this->court->id]);

        // 16:00 to 02:00, Friday closed — the evening runs into the next day.
        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '16:00', 'close_time' => '02:00', 'is_closed' => $weekday === 5,
            ]);
        }
    }

    /** Thursday 7 March 2030 in Riyadh, at a wall-clock time; $plus days after. */
    private function riyadh(string $time, int $plus = 0): Carbon
    {
        return Carbon::parse('2030-03-07 '.$time, 'Asia/Riyadh')->addDays($plus);
    }

    private function hours(): Hours
    {
        return app(Hours::class);
    }

    public function test_a_late_day_closes_the_next_morning(): void
    {
        $w = $this->hours()->windowFor($this->org->id, $this->riyadh('00:00'));

        $this->assertTrue($w['open']->equalTo($this->riyadh('16:00')));
        $this->assertTrue($w['close']->equalTo($this->riyadh('02:00', 1)));
        $this->assertTrue($w['overnight']);
    }

    public function test_one_in_the_morning_belongs_to_the_evening_before(): void
    {
        $day = $this->hours()->businessDayOf($this->org->id, $this->riyadh('01:00', 1));

        $this->assertSame('2030-03-07', $day->format('Y-m-d'));
    }

    public function test_bookings_across_midnight_are_inside_hours_and_past_closing_are_not(): void
    {
        $h = $this->hours();

        $this->assertTrue($h->isWithinHours($this->org->id, $this->riyadh('23:30'), $this->riyadh('00:30', 1)));
        $this->assertTrue($h->isWithinHours($this->org->id, $this->riyadh('01:00', 1), $this->riyadh('02:00', 1)));
        $this->assertFalse($h->isWithinHours($this->org->id, $this->riyadh('01:30', 1), $this->riyadh('02:30', 1)));
        $this->assertFalse($h->isWithinHours($this->org->id, $this->riyadh('15:00'), $this->riyadh('16:00')));
    }

    public function test_a_guest_can_book_one_in_the_morning(): void
    {
        // Wednesday night → Thursday 01:00 local, a week ahead so it is never past.
        $start = Carbon::now('Asia/Riyadh')->next(Carbon::THURSDAY)->addWeek()->setTime(1, 0);

        $this->postJson('/api/public/bookings', [
            'serviceId' => $this->service->id,
            'resourceId' => $this->court->id,
            'startAt' => $start->toIso8601String(),
            'name' => 'سعد',
            'phone' => '0501234567',
        ])->assertCreated();
    }

    public function test_settings_can_save_a_late_day_but_not_an_empty_one(): void
    {
        $row = fn ($open, $close) => ['weekday' => 4, 'open' => $open, 'close' => $close, 'isClosed' => false];

        $this->actingAs($this->operator, 'sanctum')
            ->putJson('/api/catalog', ['businessHours' => [$row('18:00', '03:00')]])
            ->assertNoContent();
        $this->assertSame('03:00:00', DB::table('business_hours')->where('org_id', $this->org->id)->where('weekday', 4)->value('close_time'));

        $this->actingAs($this->operator, 'sanctum')
            ->putJson('/api/catalog', ['businessHours' => [$row('09:00', '09:00')]])
            ->assertStatus(422);
    }

    private function period(string $from, string $to, string $label = 'رمضان', array $over = []): array
    {
        return [
            'id' => (string) Str::uuid(),
            'label' => $label,
            'startsOn' => $from,
            'endsOn' => $to,
            'hours' => array_map(fn ($d) => ['weekday' => $d, 'open' => '20:00', 'close' => '03:00', 'isClosed' => false] + $over, range(0, 6)),
        ];
    }

    public function test_a_special_period_replaces_the_week_on_its_dates(): void
    {
        $this->actingAs($this->operator, 'sanctum')
            ->putJson('/api/catalog', ['specialPeriods' => [$this->period('2030-03-07', '2030-03-08')]])
            ->assertNoContent();

        $h = $this->hours();
        // Friday is closed in the week, open in the period.
        $this->assertNotNull($h->windowFor($this->org->id, $this->riyadh('00:00', 1)));
        $this->assertTrue($h->isWithinHours($this->org->id, $this->riyadh('02:00', 1), $this->riyadh('03:00', 1)));
        $this->assertFalse($h->isWithinHours($this->org->id, $this->riyadh('16:00'), $this->riyadh('17:00')));

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/catalog')
            ->assertJsonPath('specialPeriods.0.label', 'رمضان')
            ->assertJsonPath('specialPeriods.0.startsOn', '2030-03-07');
    }

    public function test_special_periods_cannot_overlap(): void
    {
        $this->actingAs($this->operator, 'sanctum')->putJson('/api/catalog', ['specialPeriods' => [
            $this->period('2030-03-01', '2030-03-10'),
            $this->period('2030-03-10', '2030-03-12', 'العيد'),
        ]])->assertStatus(422);
    }

    public function test_a_period_left_out_is_removed(): void
    {
        $p = $this->period('2030-03-01', '2030-03-10');
        $this->actingAs($this->operator, 'sanctum')->putJson('/api/catalog', ['specialPeriods' => [$p]]);
        $this->actingAs($this->operator, 'sanctum')->putJson('/api/catalog', ['specialPeriods' => []]);

        $this->assertSame(0, DB::table('special_periods')->count());
    }

    public function test_busy_times_are_read_in_the_business_own_days(): void
    {
        // 01:00 Riyadh on the 8th is 22:00 UTC on the 7th — it belongs to the 8th here.
        DB::table('bookings')->insert([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'reference' => 'BK-2030-0001',
            'customer_id' => \App\Models\Customer::create([
                'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'x', 'phone' => '0500000000',
            ])->id,
            'service_id' => $this->service->id, 'resource_id' => $this->court->id,
            'start_at' => $this->riyadh('01:00', 1)->utc(), 'end_at' => $this->riyadh('02:00', 1)->utc(),
            'status' => 'confirmed', 'payment_status' => 'unpaid', 'price_minor' => 0, 'channel' => 'phone',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->getJson("/api/public/availability?resourceId={$this->court->id}&from=2030-03-08&to=2030-03-08")
            ->assertOk()->assertJsonCount(1);
    }
}
