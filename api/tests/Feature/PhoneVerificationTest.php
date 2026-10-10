<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The code step: a code to the phone, a token for entering it, and a booking
 * that needs the token. The token is what the device keeps.
 */
class PhoneVerificationTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private Service $service;
    private Resource $room;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::create(['name' => 'Clinic', 'slug' => 'c', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->room = Resource::create(['id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'Room 1']);
        $this->service = Service::create([
            'id' => (string) Str::uuid(), 'org_id' => $this->org->id, 'name' => 'استشارة',
            'duration_min' => 30, 'buffer_min' => 0, 'price_minor' => 15000,
        ]);
        $this->service->resources()->sync([$this->room->id]);
        foreach (range(0, 6) as $weekday) {
            DB::table('business_hours')->insert([
                'org_id' => $this->org->id, 'weekday' => $weekday,
                'open_time' => '06:00', 'close_time' => '22:00', 'is_closed' => false,
            ]);
        }
    }

    private function sendCode(string $phone = '0501234567')
    {
        return $this->withHeader('X-Org', 'c')->postJson('/api/public/otp', ['phone' => $phone]);
    }

    private function verify(string $code, string $phone = '0501234567')
    {
        return $this->withHeader('X-Org', 'c')->postJson('/api/public/otp/verify', ['phone' => $phone, 'code' => $code]);
    }

    private function book(?string $token, string $phone = '0501234567')
    {
        return $this->withHeader('X-Org', 'c')->postJson('/api/public/bookings', [
            'serviceId' => $this->service->id, 'resourceId' => $this->room->id,
            'startAt' => Carbon::now('Asia/Riyadh')->addWeek()->setTime(10, 0)->toIso8601String(),
            'name' => 'ريم', 'phone' => $phone, 'verificationToken' => $token,
        ]);
    }

    public function test_the_right_code_gives_a_token_that_books(): void
    {
        $code = $this->sendCode()->assertOk()->json('devCode');

        $token = $this->verify($code)->assertOk()->json('token');

        $this->book($token)->assertCreated();
    }

    public function test_the_token_keeps_working_for_the_next_booking(): void
    {
        $token = $this->verify($this->sendCode()->json('devCode'))->json('token');
        $this->book($token)->assertCreated();

        $this->withHeader('X-Org', 'c')->postJson('/api/public/bookings', [
            'serviceId' => $this->service->id, 'resourceId' => $this->room->id,
            'startAt' => Carbon::now('Asia/Riyadh')->addWeek()->setTime(15, 0)->toIso8601String(),
            'name' => 'ريم', 'phone' => '050 123 4567', 'verificationToken' => $token,
        ])->assertCreated();
    }

    public function test_a_wrong_code_gives_nothing(): void
    {
        $code = $this->sendCode()->json('devCode');

        $this->verify($code === '0000' ? '1111' : '0000')->assertStatus(422)->assertJson(['error' => 'invalid_code']);
    }

    public function test_five_wrong_codes_lock_the_code_even_against_the_right_one(): void
    {
        $code = $this->sendCode()->json('devCode');
        $wrong = $code === '0000' ? '1111' : '0000';
        foreach (range(1, 5) as $_) {
            $this->verify($wrong)->assertStatus(422);
        }

        $this->verify($code)->assertStatus(422);
    }

    public function test_an_expired_code_gives_nothing(): void
    {
        $code = $this->sendCode()->json('devCode');
        $this->travel(11)->minutes();

        $this->verify($code)->assertStatus(422);
    }

    public function test_a_token_proves_only_its_own_phone(): void
    {
        $token = $this->verify($this->sendCode()->json('devCode'))->json('token');

        $this->book($token, '0559999999')->assertStatus(422)->assertJson(['error' => 'phone_not_verified']);
    }

    public function test_a_token_proves_the_phone_only_for_its_own_business(): void
    {
        Organization::create(['name' => 'Other', 'slug' => 'other', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $code = $this->withHeader('X-Org', 'other')->postJson('/api/public/otp', ['phone' => '0501234567'])->json('devCode');
        $token = $this->withHeader('X-Org', 'other')
            ->postJson('/api/public/otp/verify', ['phone' => '0501234567', 'code' => $code])->json('token');

        $this->book($token)->assertStatus(422);
    }

    public function test_codes_cannot_be_sent_back_to_back(): void
    {
        $this->sendCode()->assertOk();

        $this->sendCode()->assertStatus(429)->assertJson(['error' => 'too_soon']);
    }

    public function test_the_code_is_echoed_only_when_config_says_so(): void
    {
        config(['guard.otp_echo' => false]);

        $response = $this->sendCode()->assertOk();

        $this->assertArrayNotHasKey('devCode', $response->json());
    }
}
