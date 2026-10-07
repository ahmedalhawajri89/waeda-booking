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
use App\Services\Guard\Backfill;
use App\Services\Guard\GuardEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Filling freed slots: a cancellation is offered to the waitlist and to
 * regulars, the first "yes" books it, and nobody is ever double-booked.
 */
class GuardBackfillTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private User $operator;
    private Service $service;
    private Resource $room;
    private GuardEngine $guard;
    private Carbon $now;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Clinic', 'slug' => 'c', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->operator = new User();
        $this->operator->fill(['name' => 'op', 'email' => 'op@example.com', 'password' => 'password']);
        $this->operator->org_id = $this->org->id;
        $this->operator->role = 'operator';
        $this->operator->save();

        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'استشارة',
            'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
        ]);
        $this->service->resources()->sync([$this->room->id]);
        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '09:00', 'close_time' => '18:00', 'is_closed' => false,
            ]);
        }
        $this->guard = app(GuardEngine::class);
        $this->now = Carbon::parse('2030-03-05 10:00', 'Asia/Riyadh');
    }

    private function customer(string $name, string $phone): Customer
    {
        return Customer::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => $name, 'phone' => $phone]);
    }

    private function book(Customer $c, string $local, string $status = 'confirmed'): Booking
    {
        return app(BookingWriter::class)->create([
            'org_id' => $this->org->id, 'customer_id' => $c->id, 'service_id' => $this->service->id,
            'resource_id' => $this->room->id, 'start_at' => Carbon::parse($local, 'Asia/Riyadh'), 'status' => $status,
        ]);
    }

    private function wait(Customer $c, ?string $day = null, ?array $window = null, string $ago = '1 day'): WaitlistEntry
    {
        $e = WaitlistEntry::create([
            'org_id' => $this->org->id, 'customer_id' => $c->id, 'service_id' => $this->service->id,
            'day' => $day, 'window_from' => $window[0] ?? null, 'window_to' => $window[1] ?? null, 'status' => 'waiting',
        ]);
        $e->created_at = $this->now->copy()->sub($ago);
        $e->save();

        return $e;
    }

    private function offers()
    {
        return GuardMessage::where('template', 'backfill_offer')->orderBy('sent_at')->get();
    }

    public function test_a_cancellation_is_offered_to_the_waitlist_oldest_first_then_regulars(): void
    {
        $sara = $this->customer('سارة خالد', '0501111111');
        $jood = $this->customer('جود الغامدي', '0502222222');
        $reem = $this->customer('ريم الشمري', '0503333333');
        $faisal = $this->customer('فيصل القرني', '0504444444');
        $freed = $this->book($sara, '2030-03-05 15:00', 'cancelled');
        $this->wait($reem, ago: '1 hour');
        $this->wait($jood, '2030-03-05', [900, 1080], ago: '2 days');
        // Faisal comes for this service often.
        foreach (['2030-03-01 09:00', '2030-03-02 09:00'] as $t) {
            $this->book($faisal, $t, 'completed');
        }

        $ranked = app(Backfill::class)->candidates($freed, Booking::where('org_id', $this->org->id)->get(), 'Asia/Riyadh', $this->now);
        $this->assertSame([$jood->id, $reem->id, $faisal->id], array_column($ranked, 'customerId'));
        $this->assertSame(['waitlist', 'waitlist', 'regular'], array_column($ranked, 'reason'));

        $this->guard->tick($this->org->id, $this->now);

        // Sent together, in the same instant: what matters is who got one.
        $this->assertEqualsCanonicalizing([$jood->id, $reem->id, $faisal->id], $this->offers()->pluck('customer_id')->all());
        $this->assertTrue($this->offers()->every(fn ($m) => $m->booking_id === $freed->id));
        $this->assertStringContainsString('مرحباً جود', $this->offers()->firstWhere('customer_id', $jood->id)->body);
        $this->assertSame(0, $this->guard->tick($this->org->id, $this->now), 'never offered twice');
    }

    public function test_nobody_is_offered_a_slot_too_close_to_start(): void
    {
        $this->book($this->customer('سارة', '0501111111'), '2030-03-05 10:30', 'cancelled');
        $this->wait($this->customer('جود', '0502222222'));

        $this->guard->tick($this->org->id, $this->now);

        $this->assertCount(0, $this->offers());
    }

    public function test_the_first_yes_books_it_and_the_second_is_told_it_went(): void
    {
        $sara = $this->customer('سارة', '0501111111');
        $jood = $this->customer('جود', '0502222222');
        $reem = $this->customer('ريم', '0503333333');
        $freed = $this->book($sara, '2030-03-05 15:00', 'cancelled');
        $entry = $this->wait($jood);
        $this->wait($reem, ago: '1 hour');
        $this->guard->tick($this->org->id, $this->now);
        $toJood = $this->offers()->firstWhere('customer_id', $jood->id);
        $toReem = $this->offers()->firstWhere('customer_id', $reem->id);

        $won = $this->guard->replyToOffer($toJood, '1', $this->now);
        $late = $this->guard->replyToOffer($toReem, 'أكيد', $this->now);

        $this->assertSame($jood->id, $won['booking']->customer_id);
        $this->assertTrue($won['booking']->start_at->equalTo($freed->start_at));
        $this->assertNull($late['booking']);
        $this->assertSame(1, Booking::where('status', 'confirmed')->count(), 'one slot, one booking');
        $this->assertSame('booked', $entry->fresh()->status);
        $this->assertSame(15000, GuardMessage::where('template', 'backfill_won')->first()->payload['priceMinor']);
        $this->assertSame(1, GuardMessage::where('template', 'backfill_taken')->count());
    }

    public function test_a_no_keeps_them_waiting(): void
    {
        $this->book($this->customer('سارة', '0501111111'), '2030-03-05 15:00', 'cancelled');
        $entry = $this->wait($this->customer('جود', '0502222222'));
        $this->guard->tick($this->org->id, $this->now);

        $this->guard->replyToOffer($this->offers()->first(), 'لا', $this->now);

        $this->assertSame('waiting', $entry->fresh()->status);
        $this->assertSame(1, GuardMessage::where('template', 'backfill_declined')->count());
    }

    /* ---------------------------------------------------------- endpoints */

    public function test_a_guest_can_join_the_waitlist_and_is_matched_by_phone(): void
    {
        $existing = $this->customer('جود الغامدي', '0502222222');

        $this->postJson('/api/public/waitlist', [
            'serviceId' => $this->service->id, 'day' => '2030-03-06', 'window' => [900, 1080],
            'name' => 'جود', 'phone' => '050 222 2222',
        ])->assertCreated();

        $entry = WaitlistEntry::first();
        $this->assertSame($existing->id, $entry->customer_id);
        $this->assertSame([900, 1080], $entry->toDomain()['window']);
        $this->assertSame(1, Customer::count(), 'no duplicate customer');
    }

    public function test_the_console_reads_the_waitlist_and_answers_offers_for_its_own_org_only(): void
    {
        $this->book($this->customer('سارة', '0501111111'), '2030-03-05 15:00', 'cancelled');
        $this->wait($this->customer('جود', '0502222222'));
        $this->guard->tick($this->org->id, $this->now);

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/guard/waitlist')->assertOk()->assertJsonCount(1);

        $rival = Organization::create(['name' => 'R', 'slug' => 'r', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $outsider = new User();
        $outsider->fill(['name' => 'x', 'email' => 'x@example.com', 'password' => 'password']);
        $outsider->org_id = $rival->id;
        $outsider->role = 'operator';
        $outsider->save();

        $this->actingAs($outsider, 'sanctum')
            ->postJson('/api/guard/offers/'.$this->offers()->first()->id.'/replies', ['text' => '1'])
            ->assertNotFound();
    }
}
