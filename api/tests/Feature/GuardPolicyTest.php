<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GuardPolicyTest extends TestCase
{
    use RefreshDatabase;

    private User $operator;

    private const POLICY = [
        'mediumAt' => 0.15, 'highAt' => 0.3, 'remindHoursBefore' => 24, 'confirmHoursBefore' => 3,
        'depositForHigh' => true, 'autoRelease' => false, 'releaseHoursBefore' => 2,
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $org = Organization::create(['name' => 'Clinic', 'slug' => 'c', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->operator = $this->user($org, 'op@example.com', 'operator');
    }

    private function user(Organization $org, string $email, string $role): User
    {
        $u = new User();
        $u->fill(['name' => $email, 'email' => $email, 'password' => 'password']);
        $u->org_id = $org->id;
        $u->role = $role;
        $u->save();

        return $u;
    }

    public function test_there_is_no_policy_until_one_is_saved(): void
    {
        $this->actingAs($this->operator, 'sanctum')->getJson('/api/guard/policy')
            ->assertOk()->assertJsonPath('policy', null);
    }

    public function test_a_saved_policy_is_returned(): void
    {
        $this->actingAs($this->operator, 'sanctum')->putJson('/api/guard/policy', self::POLICY)->assertNoContent();

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/guard/policy')
            ->assertOk()->assertJsonPath('policy.highAt', 0.3)->assertJsonPath('policy.autoRelease', false);
    }

    public function test_thresholds_out_of_order_are_refused(): void
    {
        $this->actingAs($this->operator, 'sanctum')
            ->putJson('/api/guard/policy', ['highAt' => 0.1] + self::POLICY)
            ->assertStatus(422);
    }

    public function test_releasing_before_asking_to_confirm_is_refused(): void
    {
        $this->actingAs($this->operator, 'sanctum')
            ->putJson('/api/guard/policy', ['releaseHoursBefore' => 5] + self::POLICY)
            ->assertStatus(422);
    }

    public function test_the_policy_is_private_to_the_operator(): void
    {
        $this->getJson('/api/guard/policy')->assertUnauthorized();

        $customer = $this->user(Organization::first(), 'c@example.com', 'customer');
        $this->actingAs($customer, 'sanctum')->getJson('/api/guard/policy')->assertForbidden();
    }

    public function test_each_organization_has_its_own(): void
    {
        $this->actingAs($this->operator, 'sanctum')->putJson('/api/guard/policy', self::POLICY)->assertNoContent();

        $rival = Organization::create(['name' => 'Rival', 'slug' => 'r', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->actingAs($this->user($rival, 'r@example.com', 'operator'), 'sanctum')
            ->getJson('/api/guard/policy')->assertOk()->assertJsonPath('policy', null);
    }
}
