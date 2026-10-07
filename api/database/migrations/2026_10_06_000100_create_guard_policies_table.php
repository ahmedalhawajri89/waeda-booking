<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The appointment guard's policy, one row per organization.
 *
 * A JSON column rather than a column per setting: the policy is read and
 * written whole, the client normalises it against defaults
 * (src/lib/guard.js), and new settings will keep arriving as the guard grows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guard_policies', function (Blueprint $table) {
            $table->uuid('org_id')->primary();
            $table->json('policy');
            $table->timestamps();

            $table->foreign('org_id')->references('id')->on('organizations')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guard_policies');
    }
};
