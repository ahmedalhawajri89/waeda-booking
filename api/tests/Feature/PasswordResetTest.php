<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

/**
 * A forgotten password: a link by email, then a new password from it.
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $org = Organization::create([
            'name' => 'Rayhan', 'slug' => 'rayhan', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
        ]);
        $this->owner = new User();
        $this->owner->fill(['name' => 'Sara', 'email' => 'owner@example.com', 'password' => 'old-password']);
        $this->owner->org_id = $org->id;
        $this->owner->role = 'operator';
        $this->owner->save();
    }

    public function test_a_known_address_gets_a_link_to_the_app(): void
    {
        Notification::fake();

        $this->postJson('/api/auth/forgot-password', ['email' => 'owner@example.com'])
            ->assertOk()->assertJson(['status' => 'sent']);

        Notification::assertSentTo($this->owner, ResetPassword::class, function ($n) {
            $mail = $n->toMail($this->owner);

            return str_starts_with($mail->actionUrl, config('app.frontend_url').'/reset-password?token=')
                && str_contains($mail->actionUrl, 'email=owner%40example.com');
        });
    }

    public function test_an_unknown_address_gets_the_same_answer_and_no_mail(): void
    {
        Notification::fake();

        $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com'])
            ->assertOk()->assertJson(['status' => 'sent']);

        Notification::assertNothingSent();
    }

    public function test_the_token_sets_a_new_password(): void
    {
        $token = Password::createToken($this->owner);

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => 'owner@example.com',
            'password' => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ])->assertOk();

        $this->postJson('/api/auth/login', ['email' => 'owner@example.com', 'password' => 'new-password-1'])
            ->assertOk();
        $this->postJson('/api/auth/login', ['email' => 'owner@example.com', 'password' => 'old-password'])
            ->assertStatus(422);
    }

    public function test_a_wrong_token_is_refused(): void
    {
        Password::createToken($this->owner);

        $this->postJson('/api/auth/reset-password', [
            'token' => 'not-the-token',
            'email' => 'owner@example.com',
            'password' => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ])->assertStatus(422)->assertJsonValidationErrors('token');
    }

    public function test_a_token_works_once(): void
    {
        $token = Password::createToken($this->owner);
        $body = [
            'token' => $token,
            'email' => 'owner@example.com',
            'password' => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ];

        $this->postJson('/api/auth/reset-password', $body)->assertOk();
        $this->postJson('/api/auth/reset-password', $body)->assertStatus(422);
    }

    public function test_the_password_must_be_confirmed_and_long_enough(): void
    {
        $token = Password::createToken($this->owner);

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => 'owner@example.com',
            'password' => 'short',
            'password_confirmation' => 'other',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_a_reset_signs_out_every_device(): void
    {
        $this->owner->createToken('laptop');
        $this->owner->createToken('phone');
        $token = Password::createToken($this->owner);

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => 'owner@example.com',
            'password' => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ])->assertOk();

        $this->assertSame(0, $this->owner->tokens()->count());
    }
}
