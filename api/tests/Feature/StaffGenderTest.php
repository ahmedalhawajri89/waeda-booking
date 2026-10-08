<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Who a customer is seen by: optional, and only ever one of two values. */
class StaffGenderTest extends TestCase
{
    use RefreshDatabase;

    private User $operator;

    protected function setUp(): void
    {
        parent::setUp();

        $org = Organization::create(['name' => 'Salon', 'slug' => 'salon', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR']);
        $this->operator = new User();
        $this->operator->fill(['name' => 'op', 'email' => 'op@example.com', 'password' => 'password']);
        $this->operator->org_id = $org->id;
        $this->operator->role = 'operator';
        $this->operator->save();
    }

    private function save(array $resource)
    {
        return $this->actingAs($this->operator, 'sanctum')->putJson('/api/catalog', ['resources' => [
            ['id' => (string) Str::uuid(), 'name' => 'نورة', 'isActive' => true] + $resource,
        ]]);
    }

    public function test_a_team_member_can_be_marked_and_read_back(): void
    {
        $this->save(['gender' => 'female'])->assertNoContent();

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/catalog')
            ->assertJsonPath('resources.0.gender', 'female');
    }

    public function test_it_is_optional(): void
    {
        $this->save([])->assertNoContent();

        $this->actingAs($this->operator, 'sanctum')->getJson('/api/catalog')
            ->assertJsonPath('resources.0.gender', null);
    }

    public function test_only_two_values_are_accepted(): void
    {
        $this->save(['gender' => 'other'])->assertStatus(422);
    }
}
