<?php

namespace Tests;

use App\Models\Customer;
use App\Models\Organization;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    /**
     * A token proving this phone, as POST /public/otp/verify returns — for
     * tests about something other than the code step itself. The business is
     * the one a guest without X-Org books with, unless one is named.
     */
    protected function phoneToken(string $phone, ?string $orgId = null): string
    {
        $token = Str::random(40);
        DB::table('phone_verifications')->insert([
            'id' => (string) Str::uuid(),
            'org_id' => $orgId ?? Organization::query()->orderBy('created_at')->orderBy('id')->value('id'),
            'phone_digits' => Customer::normalisePhone($phone),
            'code_hash' => '',
            'expires_at' => now(),
            'token_hash' => hash('sha256', $token),
            'verified_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $token;
    }
}
