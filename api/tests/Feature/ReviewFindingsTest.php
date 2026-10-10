<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\GuardMessage;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use App\Models\WaitlistEntry;
use App\Services\BookingWriter;
use App\Services\Guard\GuardEngine;
use App\Services\Guard\GuardPolicy;
use App\Services\Guard\RuleUnderstanding;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The code review's findings, each written as the behaviour it should have.
 * A failing test here is a confirmed finding; a passing one was a wrong claim.
 */
class ReviewFindingsTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private Customer $customer;
    private Service $service;
    private Resource $room;
    private GuardEngine $guard;

    /** Tuesday 5 March 2030, 10:00 in Riyadh. */
    private Carbon $now;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Clinic', 'slug' => 'c', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'استشارة',
            'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
        ]);
        $this->service->resources()->sync([$this->room->id]);
        $this->customer = Customer::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'سارة خالد', 'phone' => '0501234567',
        ]);
        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '06:00', 'close_time' => '22:00', 'is_closed' => false,
            ]);
        }
        $this->guard = app(GuardEngine::class);
        $this->now = Carbon::parse('2030-03-05 10:00', 'Asia/Riyadh');
    }

    private function book(string $local, ?Customer $customer = null): Booking
    {
        return app(BookingWriter::class)->create([
            'org_id' => $this->org->id, 'customer_id' => ($customer ?? $this->customer)->id,
            'service_id' => $this->service->id, 'resource_id' => $this->room->id,
            'start_at' => Carbon::parse($local, 'Asia/Riyadh'), 'status' => 'confirmed',
        ]);
    }

    private function policy(array $overrides): void
    {
        DB::table('guard_policies')->insert([
            'org_id' => $this->org->id,
            'policy' => json_encode($overrides + GuardPolicy::DEFAULTS),
        ]);
    }

    /* ------------------------------------------- G2: positive replies cancel */

    public static function notACancel(): array
    {
        return [
            'I will not be late' => ['ما راح اتأخر'],
            'no problem, coming' => ['لا مشكلة، جاي'],
        ];
    }

    #[DataProvider('notACancel')]
    public function test_G2_a_reply_that_is_not_a_cancel_is_not_read_as_one(string $text): void
    {
        $intent = (new RuleUnderstanding())->understand($text, $this->now)['intent'];

        $this->assertNotSame('cancel', $intent, "«{$text}» was read as cancel");
    }

    public function test_G2_i_will_not_be_late_keeps_the_booking(): void
    {
        $booking = $this->book('2030-03-06 13:00');

        $this->guard->reply($booking, 'ما راح اتأخر', $this->now);

        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    /* ----------------------------------------- G1: a stale offer stays open */

    public function test_G1_an_old_unanswered_offer_does_not_move_the_booking_days_later(): void
    {
        $booking = $this->book('2030-03-05 13:00');
        $this->guard->reply($booking, 'خلّيها بكرة العصر', $this->now);

        // Staff move it by hand to the 10th; the offer (times on the 6th) is never answered.
        $moved = Carbon::parse('2030-03-10 11:00', 'Asia/Riyadh');
        app(BookingWriter::class)->update($booking->fresh(), ['start_at' => $moved]);

        // Two days later, the customer sends "1" — meant as "confirm".
        $this->guard->reply($booking->fresh(), '1', $this->now->copy()->addDays(2));

        $this->assertTrue(
            $booking->fresh()->start_at->equalTo($moved),
            'the booking moved to '.$booking->fresh()->start_at->setTimezone('Asia/Riyadh').', a time already in the past',
        );
    }

    /* ---------------------------- G3: a moved booking is released anyway */

    public function test_G3_a_booking_the_customer_just_moved_is_not_auto_released(): void
    {
        $this->policy(['mediumAt' => 0.01, 'highAt' => 0.9, 'autoRelease' => true, 'releaseHoursBefore' => 2]);
        $booking = $this->book('2030-03-05 13:00');

        // 2.5 hours before: asked to confirm.
        $this->guard->tick($this->org->id, $this->now->copy()->addMinutes(30));
        $this->assertSame(1, GuardMessage::where('template', 'confirm_request')->count());

        // The customer answers by moving it to tomorrow afternoon.
        $this->guard->reply($booking->fresh(), 'خلّيها بكرة العصر', $this->now->copy()->addMinutes(31));
        $this->guard->reply($booking->fresh(), '1', $this->now->copy()->addMinutes(32));
        $newStart = $booking->fresh()->start_at;
        $this->assertSame('2030-03-06', $newStart->copy()->setTimezone('Asia/Riyadh')->format('Y-m-d'));

        // 1.5 hours before the new time.
        $this->guard->tick($this->org->id, $newStart->copy()->subMinutes(90));

        $this->assertSame('confirmed', $booking->fresh()->status, 'a booking the customer actively moved was released');
    }

    /* ------------------------- G5: one organization stops the scheduler */

    public function test_G5_one_organizations_error_does_not_stop_the_rest(): void
    {
        Organization::create(['name' => 'Second', 'slug' => 'second', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $ticked = [];
        $this->mock(GuardEngine::class, function ($mock) use (&$ticked) {
            $mock->shouldReceive('tick')->andReturnUsing(function (string $org) use (&$ticked) {
                $ticked[] = $org;
                if (count($ticked) === 1) {
                    throw new \RuntimeException('bad data in the first organization');
                }

                return 0;
            });
        });

        try {
            Artisan::call('guard:tick');
        } catch (\RuntimeException) {
            // Recorded below: what matters is whether the second org ran.
        }

        $this->assertCount(2, $ticked, 'the second organization never got its reminders');
    }

    /* ------------------------ A1: claiming someone else's customer record */

    public function test_A1_registering_with_someone_elses_phone_does_not_take_their_record(): void
    {
        $this->postJson('/api/auth/register', [
            'email' => 'attacker@example.com', 'password' => 'secret12',
            'fullName' => 'Attacker', 'phone' => '0501234567',
        ])->assertCreated();

        $this->assertNull(
            $this->customer->fresh()->user_id,
            'an unverified phone number linked the new account to سارة\'s customer record',
        );
    }

    /* -------------------------------- A2: internal notes reach the customer */

    public function test_A2_a_customer_does_not_see_the_business_notes_about_them(): void
    {
        $user = new User();
        $user->fill(['name' => 'Sara', 'email' => 'sara@example.com', 'password' => 'password']);
        $user->org_id = $this->org->id;
        $user->save();
        $this->customer->update(['user_id' => $user->id, 'notes' => 'كثيرة الغياب، اطلبوا عربون']);

        Sanctum::actingAs($user);
        $record = $this->getJson('/api/customers')->assertOk()->assertJsonCount(1)->json('0');

        $this->assertArrayNotHasKey('notes', $record, 'the customer read: '.($record['notes'] ?? ''));
    }

    /* ---------------------------- A3: someone else's phone opens the booking */

    public function test_A3_a_different_phone_sharing_the_last_four_digits_cannot_open_a_booking(): void
    {
        $booking = $this->book('2030-03-06 13:00');

        $this->withHeader('X-Org', 'c')
            ->getJson("/api/public/bookings/{$booking->reference}?phone=0599994567")
            ->assertNotFound();
    }

    /* ------------------------------- A4: a guest renames an existing customer */

    public function test_A4_booking_with_an_existing_phone_does_not_rename_the_customer(): void
    {
        // Someone else's number, without its code: refused, and nothing changes.
        $this->withHeader('X-Org', 'c')->postJson('/api/public/bookings', [
            'serviceId' => $this->service->id, 'resourceId' => $this->room->id,
            'startAt' => Carbon::parse('2030-03-06 11:00', 'Asia/Riyadh')->toIso8601String(),
            'name' => 'اسم آخر', 'phone' => '0501234567',
        ])->assertStatus(422)->assertJson(['error' => 'phone_not_verified']);

        $this->assertSame('سارة خالد', $this->customer->fresh()->name);
        $this->assertSame(0, Booking::count());
    }

    /* ---------------------------- A5: a class seat moved off its session */

    public function test_A5_a_class_seat_cannot_be_moved_to_a_time_that_is_not_a_session(): void
    {
        $trainer = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'نورة']);
        $yoga = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Yoga',
            'duration_min' => 60, 'buffer_min' => 0, 'price_minor' => 6000, 'capacity' => 3,
        ]);
        $yoga->resources()->sync([$trainer->id]);
        $yoga->sessions()->create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'resource_id' => $trainer->id,
            'weekday' => 0, 'start_time' => '07:00',
        ]);
        $sunday = Carbon::now('Asia/Riyadh')->next(Carbon::SUNDAY)->addWeek()->setTimeFromTimeString('07:00');

        $ref = $this->withHeader('X-Org', 'c')->postJson('/api/public/bookings', [
            'serviceId' => $yoga->id, 'resourceId' => $trainer->id, 'startAt' => $sunday->toIso8601String(),
            'name' => 'عميلة', 'phone' => '0500000001', 'verificationToken' => $this->phoneToken('0500000001'),
        ])->assertCreated()->json('reference');

        // Tuesday 15:00 — no class then.
        $this->withHeader('X-Org', 'c')->postJson("/api/public/bookings/{$ref}/reschedule", [
            'phone' => '0500000001', 'verificationToken' => $this->phoneToken('0500000001'),
            'startAt' => $sunday->copy()->addDays(2)->setTimeFromTimeString('15:00')->toIso8601String(),
        ])->assertStatus(422);
    }

    /* ------------------------------ G7: the waitlist takes any number, again */

    public function test_G7_a_stranger_cannot_put_someone_elses_number_on_the_waitlist(): void
    {
        $this->withHeader('X-Org', 'c')->postJson('/api/public/waitlist', [
            'serviceId' => $this->service->id, 'day' => '2030-03-06',
            'name' => 'غريب', 'phone' => '0555555555',
        ])->assertStatus(422)->assertJson(['error' => 'phone_not_verified']);

        $this->assertSame(0, WaitlistEntry::count());
    }

    public function test_G7_the_same_phone_joining_repeatedly_is_one_entry(): void
    {
        $token = $this->phoneToken('0555555555');
        foreach (range(1, 3) as $_) {
            $this->withHeader('X-Org', 'c')->postJson('/api/public/waitlist', [
                'serviceId' => $this->service->id, 'day' => '2030-03-06',
                'name' => 'غريب', 'phone' => '0555555555', 'verificationToken' => $token,
            ])->assertSuccessful();
        }

        $this->assertSame(1, WaitlistEntry::where('status', 'waiting')->count());
    }
}
