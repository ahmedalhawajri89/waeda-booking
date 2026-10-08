<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What each business pays for.
 *
 * The plan lives on the organization; a trial is just a date, so nothing has
 * to run when it ends — the plan in force is worked out when asked. Upgrades
 * are requests until a payment gateway is connected: someone at Waeda
 * activates them (php artisan waeda:activate).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('plan', 16)->default('free')->after('currency');
            $table->string('billing_cycle', 8)->default('monthly')->after('plan');
            $table->timestamp('trial_ends_at')->nullable()->after('billing_cycle');
            // An add-on pack is for one month: the count and the month it is for.
            $table->unsignedInteger('extra_messages')->default(0)->after('trial_ends_at');
            $table->string('extra_month', 7)->nullable()->after('extra_messages');
        });

        // Businesses already here get the same start a new one does.
        DB::table('organizations')->update(['trial_ends_at' => now()->addDays(14)]);

        Schema::create('plan_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('org_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('plan', 16)->nullable();
            $table->string('cycle', 8)->default('monthly');
            $table->boolean('extra_pack')->default(false);
            $table->string('status', 12)->default('pending');
            $table->timestamps();
            $table->index(['org_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plan_requests');
        Schema::table('organizations', fn (Blueprint $t) => $t->dropColumn(
            ['plan', 'billing_cycle', 'trial_ends_at', 'extra_messages', 'extra_month']
        ));
    }
};
