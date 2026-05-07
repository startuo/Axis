<script lang="ts">
	import MessageFeedbackForm from "../../feedback/MessageFeedbackForm.svelte";

	export let token = "";
</script>

<div class="message-view">
	<MessageFeedbackForm {token} />
</div>
