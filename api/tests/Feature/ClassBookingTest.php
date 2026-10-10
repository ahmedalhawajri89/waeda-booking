<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use App\Services\Guard\Backfill;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * A class: one time, several seats. Seats in the same session share the
 * time up to the capacity; anything else at that time is still a clash.
 */
class ClassBookingTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Service $yoga;
    private Service $private;
    private Resource $trainer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Studio', 'slug' => 'studio', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->operator = new User();
        $this->operator->fill(['name' => 'op', 'email' => 'op@example.com', 'password' => 'password']);
        $this->operator->org_id = $this->org->id;
        $this->operator->role = 'operator';
        $this->operator->save();

        $this->trainer = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'نورة']);
        $this->yoga = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Yoga',
            'duration_min' => 60, 'buffer_min' => 0, 'price_minor' => 6000, 'capacity' => 3,
        ]);
        $this->yoga->resources()->sync([$this->trainer->id]);
        $this->private = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Private',
            'duration_min' => 60, 'buffer_min' => 0, 'price_minor' => 20000,
        ]);
        $this->private->resources()->sync([$this->trainer->id]);
        // Sundays at 07:00 with Noura.
        $this->yoga->sessions()->create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'resource_id' => $this->trainer->id,
            'weekday' => 0, 'start_time' => '07:00',
        ]);
        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '06:00', 'close_time' => '22:00', 'is_closed' => false,
            ]);
        }
    }

    /** Next week's Sunday, at a wall-clock time in Riyadh. */
    private function sunday(string $time = '07:00'): Carbon
    {
        return Carbon::now('Asia/Riyadh')->next(Carbon::SUNDAY)->addWeek()->setTimeFromTimeString($time);
    }

    private function seat(int $n, ?Service $service = null, ?Carbon $at = null)
    {
        $phone = '05000000'.str_pad((string) $n, 2, '0', STR_PAD_LEFT);

        return $this->postJson('/api/public/bookings', [
            'serviceId' => ($service ?? $this->yoga)->id, 'resourceId' => $this->trainer->id,
            'startAt' => ($at ?? $this->sunday())->toIso8601String(),
            'name' => "عميلة $n", 'phone' => $phone, 'verificationToken' => $this->phoneToken($phone),
        ]);
    }

    public function test_a_session_takes_as_many_as_it_seats_and_no_more(): void
    {
        $this->seat(1)->assertCreated();
        $this->seat(2)->assertCreated();
        $this->seat(3)->assertCreated();
        $this->seat(4)->assertStatus(409);
    }

    public function test_a_class_is_booked_only_at_its_own_times(): void
    {
        $this->seat(1, null, $this->sunday('09:00'))->assertStatus(422);
    }

    public function test_anything_else_at_that_time_is_still_a_clash(): void
    {
        $this->seat(1)->assertCreated();
        $this->seat(2, $this->private, $this->sunday('07:30'))->assertStatus(409);
    }

    public function test_seats_are_counted_without_saying_who(): void
    {
        $this->seat(1)->assertCreated();
        $this->seat(2)->assertCreated();
        $day = $this->sunday()->toDateString();

        $r = $this->getJson("/api/public/classes/{$this->yoga->id}/seats?from={$day}&to={$day}")->assertOk();
        $this->assertSame(2, $r->json('0.taken'));
        $this->assertSame(['startAt', 'resourceId', 'taken'], array_keys($r->json('0')));
        $this->assertStringNotContainsString('عميلة', $r->getContent());
    }

    public function test_a_freed_seat_is_free_while_the_class_is_not_full(): void
    {
        $this->seat(1)->assertCreated();
        $this->seat(2)->assertCreated();
        $freed = Booking::where('service_id', $this->yoga->id)->first();
        $freed->update(['status' => 'cancelled']);

        $all = Booking::with('service')->where('org_id', $this->org->id)->get();
        $this->assertFalse(app(Backfill::class)->taken($all->firstWhere('id', $freed->id), $all));
    }

    public function test_settings_keep_the_capacity_and_the_weekly_times(): void
    {
        $other = Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $foreign = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $other->id, 'name' => 'x']);

        $this->actingAs($this->operator, 'sanctum')->putJson('/api/catalog', ['services' => [[
            'id' => $this->yoga->id, 'name' => 'Yoga', 'durationMin' => 60, 'bufferMin' => 0, 'priceMinor' => 6000,
            'capacity' => 12, 'resourceIds' => [$this->trainer->id], 'iconKey' => 'Sparkles', 'isActive' => true,
            'sessions' => [
                ['weekday' => 2, 'time' => '18:30', 'resourceId' => $this->trainer->id],
                ['weekday' => 4, 'time' => '18:30', 'resourceId' => $foreign->id],
            ],
        ]]])->assertNoContent();

        $yoga = collect($this->actingAs($this->operator, 'sanctum')->getJson('/api/catalog')->json('services'))
            ->firstWhere('id', $this->yoga->id);
        $this->assertSame(12, $yoga['capacity']);
        // The other business's room is not this class's to use.
        $this->assertCount(1, $yoga['sessions']);
        $this->assertSame('18:30', $yoga['sessions'][0]['time']);
    }

    public function test_a_training_centre_signs_up_with_a_class(): void
    {
        $this->postJson('/api/auth/register-business', [
            'fullName' => 'هند', 'email' => 'centre@example.com', 'password' => 'password123',
            'business' => ['name' => 'مركز الإتقان', 'slug' => 'itqan'],
            'staff' => [['name' => 'أ. هند']],
            'services' => [[
                'name' => 'ورشة جماعية', 'durationMin' => 90, 'priceMinor' => 8000, 'iconKey' => 'Sparkles',
                'capacity' => 15, 'sessions' => [['weekday' => 0, 'time' => '18:00'], ['weekday' => 2, 'time' => '18:00']],
            ]],
            'hours' => array_map(fn ($d) => ['weekday' => $d, 'open' => '09:00', 'close' => '21:00', 'isClosed' => false], range(0, 6)),
        ])->assertCreated();

        $service = Service::where('name', 'ورشة جماعية')->firstOrFail();
        $this->assertSame(15, $service->capacity);
        $this->assertSame(2, $service->sessions()->count());
    }
}
