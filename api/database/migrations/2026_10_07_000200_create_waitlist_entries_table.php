<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * People waiting for a time to free up, and the link from a backfill offer to
 * the candidate it went to.
 *
 * Offers of a freed slot live on that slot's booking (booking_id), addressed
 * to someone else (customer_id); a candidate's answer points back at the
 * offer it answers (reply_to). Messages to a booking's own customer leave
 * both null, as before.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waitlist_entries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('org_id');
            $table->uuid('customer_id');
            $table->uuid('service_id');
            $table->date('day')->nullable();          // null: any day
            $table->unsignedSmallInteger('window_from')->nullable(); // minutes from midnight
            $table->unsignedSmallInteger('window_to')->nullable();
            $table->enum('status', ['waiting', 'booked', 'removed'])->default('waiting');
            $table->timestamps();

            $table->foreign('org_id')->references('id')->on('organizations')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->foreign('service_id')->references('id')->on('services')->cascadeOnDelete();
            $table->index(['org_id', 'status', 'service_id']);
        });

        Schema::table('guard_messages', function (Blueprint $table) {
            $table->uuid('customer_id')->nullable()->after('booking_id');
            $table->uuid('reply_to')->nullable()->after('customer_id');
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('guard_messages', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
            $table->dropColumn(['customer_id', 'reply_to']);
        });
        Schema::dropIfExists('waitlist_entries');
    }
};
