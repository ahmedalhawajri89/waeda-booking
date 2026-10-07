<?php

namespace Tests\Feature;

use Anthropic\Client;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\GuardMessage;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Services\BookingWriter;
use App\Services\Guard\ClaudeUnderstanding;
use App\Services\Guard\GuardEngine;
use App\Services\Guard\RuleUnderstanding;
use GuzzleHttp\Client as Guzzle;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Moving an appointment by conversation: the customer asks, the guard offers
 * three free times, the customer picks one, the booking moves — and the
 * language model, when configured, only ever reads; it never decides alone.
 */
class GuardRescheduleTest extends TestCase
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
                'open_time' => '09:00', 'close_time' => '18:00', 'is_closed' => false,
            ]);
        }
        $this->guard = app(GuardEngine::class);
        $this->now = Carbon::parse('2030-03-05 10:00', 'Asia/Riyadh');
    }

    /** A booking at a local Riyadh time. */
    private function book(string $local): Booking
    {
        return app(BookingWriter::class)->create([
            'org_id' => $this->org->id, 'customer_id' => $this->customer->id,
            'service_id' => $this->service->id, 'resource_id' => $this->room->id,
            'start_at' => Carbon::parse($local, 'Asia/Riyadh'), 'status' => 'confirmed',
        ]);
    }

    private function lastOut(): GuardMessage
    {
        return GuardMessage::where('direction', 'out')->orderByDesc('sent_at')->orderByDesc('template')->get()
            ->sortByDesc(fn ($m) => $m->template === 'reschedule_offer' ? 1 : 0)->first();
    }

    /* ----------------------------------------------------------- the flow */

    public function test_asking_to_move_offers_three_free_times_inside_the_window(): void
    {
        $booking = $this->book('2030-03-05 13:00');

        $result = $this->guard->reply($booking, 'خلّيها بكرة العصر', $this->now);

        $offer = GuardMessage::where('template', 'reschedule_offer')->firstOrFail();
        $this->assertSame('reschedule', $result['intent']);
        $this->assertCount(3, $offer->payload['options']);
        foreach ($offer->payload['options'] as $at) {
            $local = Carbon::parse($at)->setTimezone('Asia/Riyadh');
            $this->assertSame('2030-03-06', $local->format('Y-m-d'));
            $this->assertGreaterThanOrEqual(15, (int) $local->format('G'));
            $this->assertLessThan(18, (int) $local->format('G'));
        }
        $this->assertStringContainsString('أرسل رقم الوقت المناسب', $offer->body);
        $this->assertTrue($booking->fresh()->start_at->equalTo(Carbon::parse('2030-03-05 13:00', 'Asia/Riyadh')));
    }

    public function test_picking_a_time_moves_the_booking_and_says_so(): void
    {
        $booking = $this->book('2030-03-05 13:00');
        $this->guard->reply($booking, 'خلّيها بكرة العصر', $this->now);
        $target = GuardMessage::where('template', 'reschedule_offer')->firstOrFail()->payload['options'][1];

        $result = $this->guard->reply($booking->fresh(), '2', $this->now->copy()->addMinute());

        $this->assertSame('choose', $result['intent']);
        $this->assertTrue($booking->fresh()->start_at->equalTo(Carbon::parse($target)));
        $this->assertSame('rescheduled', $booking->fresh()->events->last()->type);
        $this->assertSame(1, GuardMessage::where('template', 'ack_rescheduled')->count());
        $this->assertTrue(GuardMessage::where('template', 'reschedule_offer')->first()->payload['used']);
    }

    public function test_a_spent_offer_does_not_turn_a_later_2_into_a_choice(): void
    {
        $booking = $this->book('2030-03-05 13:00');
        $this->guard->reply($booking, 'خلّيها بكرة العصر', $this->now);
        $this->guard->reply($booking->fresh(), '1', $this->now->copy()->addMinute());

        // With the offer answered, "2" means what it always meant: cancel.
        $result = $this->guard->reply($booking->fresh(), '2', $this->now->copy()->addMinutes(2));

        $this->assertSame('cancel', $result['intent']);
        $this->assertSame('cancelled', $booking->fresh()->status);
    }

    public function test_a_time_taken_since_it_was_offered_is_offered_again_not_double_booked(): void
    {
        $booking = $this->book('2030-03-05 13:00');
        $this->guard->reply($booking, 'خلّيها بكرة العصر', $this->now);
        $target = GuardMessage::where('template', 'reschedule_offer')->firstOrFail()->payload['options'][0];
        // Someone else books it first.
        $this->book(Carbon::parse($target)->setTimezone('Asia/Riyadh')->format('Y-m-d H:i'));

        $this->guard->reply($booking->fresh(), '1', $this->now->copy()->addMinute());

        $this->assertTrue($booking->fresh()->start_at->equalTo(Carbon::parse('2030-03-05 13:00', 'Asia/Riyadh')));
        $this->assertSame(2, GuardMessage::where('template', 'reschedule_offer')->count());
        $fresh = GuardMessage::where('template', 'reschedule_offer')->get()->first(fn ($m) => empty($m->payload['used']));
        $this->assertNotContains($target, $fresh->payload['options']);
    }

    public function test_nowhere_to_go_is_handed_to_staff(): void
    {
        DB::table('business_hours')->update(['is_closed' => true]);
        $booking = $this->book('2030-03-05 13:00');

        $this->guard->reply($booking, 'خلّيها بكرة', $this->now);

        $this->assertSame(1, GuardMessage::where('template', 'no_slots')->count());
        $this->assertTrue(GuardMessage::where('direction', 'in')->first()->needs_staff);
    }

    /* ----------------------------------------------------------- the rules */

    /** The same sentences as src/lib/__tests__/replyRules.spec.js. */
    public static function sentences(): array
    {
        return [
            ['ممكن أغير الموعد لبكرة؟', ['intent' => 'reschedule', 'day' => '2030-03-06']],
            ['خلّيها بعد بكرة', ['intent' => 'reschedule', 'day' => '2030-03-07']],
            ['خلّيها الخميس العصر', ['intent' => 'reschedule', 'day' => '2030-03-07', 'window' => [900, 1080]]],
            ['أجّلها للسبت الصبح', ['intent' => 'reschedule', 'day' => '2030-03-09', 'window' => [540, 720]]],
            ['بكرة الساعة 5', ['intent' => 'reschedule', 'day' => '2030-03-06', 'time' => 1020]],
            ['بكرة ٤:٣٠ العصر', ['intent' => 'reschedule', 'day' => '2030-03-06', 'window' => [900, 1080], 'time' => 990]],
            ['لا، خلّيها بكرة', ['intent' => 'reschedule', 'day' => '2030-03-06']],
            ['خلّيها الثلاثاء', ['intent' => 'reschedule', 'day' => '2030-03-12']],
            ['بدي وقت ثاني', ['intent' => 'reschedule']],
            ['10 دقائق', ['intent' => 'unknown']],
        ];
    }

    #[DataProvider('sentences')]
    public function test_the_rules_read_as_the_client_reads(string $text, array $expected): void
    {
        $this->assertEquals($expected, (new RuleUnderstanding())->understand($text, $this->now));
    }

    public function test_a_number_is_a_choice_only_while_an_offer_is_open(): void
    {
        $rules = new RuleUnderstanding();
        $this->assertSame(['intent' => 'choose', 'option' => 2], $rules->understand('2', $this->now, ['offered' => ['a', 'b', 'c']]));
        $this->assertSame('cancel', $rules->understand('2', $this->now)['intent']);
    }

    /* ------------------------------------------------------ the model path */

    /** A Claude client whose HTTP is canned, recording what it was sent. */
    private function claude(array $responses, array &$sent): ClaudeUnderstanding
    {
        $stack = HandlerStack::create(new MockHandler($responses));
        $stack->push(Middleware::history($sent));
        $client = new Client(apiKey: 'test', requestOptions: ['transporter' => new Guzzle(['handler' => $stack]), 'maxRetries' => 0]);

        return new ClaudeUnderstanding($client, new RuleUnderstanding(), 'claude-opus-5-5');
    }

    private static function answer(array $json, string $stop = 'end_turn'): Response
    {
        return new Response(200, ['Content-Type' => 'application/json'], json_encode([
            'id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-opus-5-5',
            'content' => [['type' => 'text', 'text' => json_encode($json)]],
            'stop_reason' => $stop, 'stop_sequence' => null,
            'usage' => ['input_tokens' => 10, 'output_tokens' => 10],
        ]));
    }

    public function test_claude_reads_what_the_rules_cannot(): void
    {
        $sent = [];
        $model = $this->claude([self::answer([
            'intent' => 'reschedule', 'option' => null, 'day' => '2030-03-07',
            'window_from' => '17:00', 'window_to' => '21:00', 'time' => null,
        ])], $sent);

        $read = $model->understand('مو اليوم، بعد صلاة المغرب يوم الخميس', $this->now, ['service' => 'استشارة', 'startAt' => '2030-03-05 13:00']);

        $this->assertSame(['intent' => 'reschedule', 'day' => '2030-03-07', 'window' => [1020, 1260]], $read);
    }

    public function test_claude_is_never_sent_the_customers_name_or_phone(): void
    {
        $sent = [];
        $model = $this->claude([self::answer([
            'intent' => 'confirm', 'option' => null, 'day' => null, 'window_from' => null, 'window_to' => null, 'time' => null,
        ])], $sent);

        $model->understand('أكيد', $this->now, ['service' => 'استشارة', 'startAt' => '2030-03-05 13:00']);

        $body = (string) $sent[0]['request']->getBody();
        $this->assertStringNotContainsString('سارة', $body);
        $this->assertStringNotContainsString('0501234567', $body);
        $this->assertStringContainsString('"effort":"low"', $body);
        $this->assertStringContainsString('json_schema', $body);
        // A policy decline is retried server-side on the default fallback.
        $this->assertStringContainsString('"fallbacks":"default"', $body);
        $this->assertStringContainsString('server-side-fallback-2026-07-01', $sent[0]['request']->getHeaderLine('anthropic-beta'));
    }

    public function test_an_answer_that_does_not_fit_falls_back_to_the_rules(): void
    {
        $sent = [];
        // A choice of option 7 when only three were offered.
        $model = $this->claude([self::answer([
            'intent' => 'choose', 'option' => 7, 'day' => null, 'window_from' => null, 'window_to' => null, 'time' => null,
        ])], $sent);

        $read = $model->understand('2', $this->now, ['offered' => ['a', 'b', 'c']]);

        $this->assertSame(['intent' => 'choose', 'option' => 2], $read);
    }

    public function test_an_outage_falls_back_to_the_rules(): void
    {
        $sent = [];
        $model = $this->claude([new Response(529, [], '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')], $sent);

        $this->assertSame('confirm', $model->understand('أكيد جاي', $this->now)['intent']);
    }
}
